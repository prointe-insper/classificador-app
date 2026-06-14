"""Treino do classificador de assuntos jurídicos da PGE-SP.

Espelha a abordagem ``tfidf_xgboost`` do pacote juriclass
(https://github.com/tiagoft/juriclass), ajustada à **nova taxonomia** revisada
da PGE (coluna ``PGE_ASSUNTOS_REVISADA``).

Estratégia de rótulos (decidida com o responsável pelo projeto):

- Mantém os ``--top-n`` rótulos mais frequentes da taxonomia.
- Mantém ``NÃO_NA_TAXONOMIA`` como **classe própria** (sinaliza peças fora da
  taxonomia).
- Agrupa toda a cauda longa restante em ``Outros``.

Saídas (em ``--out-dir``):

- ``model.joblib``    — dict com ``vectorizer``, ``clf``, ``label_names`` e ``metadata``.
- ``metadata.json``   — descrição legível do modelo e das classes.
- ``metrics.json``    — métricas de avaliação (balanced accuracy, macro-F1, por classe).

Uso típico::

    uv run --group train python -m model.training.train \
        --data-parquet ../classificador-assuntos/data/nova-taxonomia/analitico_pge_revisado.parquet \
        --texts-dir ../classificador-assuntos/data/peticoes_txt/poppler
"""

from __future__ import annotations

import argparse
import gc
import json
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import joblib
import numpy as np

# Torna o pacote ``app`` importável quando rodando de backend/.
BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.labels import parse_first_label  # noqa: E402
from app.services.preprocess import clean_for_model  # noqa: E402

NAO_NA_TAXONOMIA = "NÃO_NA_TAXONOMIA"
OTHER_LABEL = "Outros"


def build_targets(labels: list[str], top_n: int) -> tuple[list[str], list[str]]:
    """Agrupa rótulos crus em top-n + NÃO_NA_TAXONOMIA + Outros.

    Retorna ``(rótulos_agrupados, ordem_das_classes)``.
    """
    counts = Counter(lbl for lbl in labels if lbl and lbl != NAO_NA_TAXONOMIA)
    top = [lbl for lbl, _ in counts.most_common(top_n)]
    top_set = set(top)

    grouped: list[str] = []
    for lbl in labels:
        if lbl == NAO_NA_TAXONOMIA:
            grouped.append(NAO_NA_TAXONOMIA)
        elif lbl in top_set:
            grouped.append(lbl)
        else:
            grouped.append(OTHER_LABEL)

    # Ordem estável: top por frequência, depois NÃO_NA_TAXONOMIA, depois Outros.
    order = list(top) + [NAO_NA_TAXONOMIA, OTHER_LABEL]
    return grouped, order


def load_dataset(parquet_path: Path, texts_dir: Path) -> tuple[list[str], list[str]]:
    """Carrega textos das petições e o primeiro rótulo revisado de cada uma."""
    import pandas as pd

    df = pd.read_parquet(parquet_path)
    df = df.dropna(subset=["PGE_ASSUNTOS_REVISADA", "ID_DOC_PETICAO"]).copy()
    df["label"] = df["PGE_ASSUNTOS_REVISADA"].map(parse_first_label)
    df = df.dropna(subset=["label"])
    df["pid"] = df["ID_DOC_PETICAO"].astype("int64").astype(str)

    # Indexa os arquivos de texto disponíveis por id de documento.
    available: dict[str, Path] = {}
    for p in texts_dir.iterdir():
        if p.is_file() and p.suffix == ".txt":
            doc_id = p.name.split(" - ")[0].strip()
            available[doc_id] = p

    rows = [(available[pid], lbl) for pid, lbl in zip(df["pid"], df["label"]) if pid in available]
    paths = [p for p, _ in rows]
    labels = [lbl for _, lbl in rows]

    def read(p: Path) -> str:
        return clean_for_model(p.read_text(encoding="utf-8", errors="replace"))

    with ThreadPoolExecutor(max_workers=16) as ex:
        texts = list(ex.map(read, paths))

    return texts, labels


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    default_data = BACKEND_ROOT.parents[1] / "classificador-assuntos" / "data" / "nova-taxonomia" / "analitico_pge_revisado.parquet"
    default_texts = BACKEND_ROOT.parents[1] / "classificador-assuntos" / "data" / "peticoes_txt" / "poppler"
    parser.add_argument("--data-parquet", type=Path, default=default_data)
    parser.add_argument("--texts-dir", type=Path, default=default_texts)
    parser.add_argument("--out-dir", type=Path, default=BACKEND_ROOT / "model" / "artifacts")
    parser.add_argument("--top-n", type=int, default=10)
    parser.add_argument("--max-features", type=int, default=30_000)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--n-estimators", type=int, default=400)
    parser.add_argument("--max-depth", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.2)
    parser.add_argument("--max-bin", type=int, default=256)
    parser.add_argument("--sample", type=int, default=None,
                        help="Usa apenas N documentos (debug rápido).")
    parser.add_argument("--cache", type=Path, default=BACKEND_ROOT / "model" / "_cache_dataset.pkl",
                        help="Cache de (textos, rótulos) para evitar reler 117k arquivos.")
    parser.add_argument("--no-cache", action="store_true", help="Ignora o cache de dataset.")
    parser.add_argument("--max-per-class", type=int, default=None,
                        help="Limita o nº de documentos de TREINO por classe (subamostra a maioria).")
    args = parser.parse_args()

    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics import (
        balanced_accuracy_score,
        classification_report,
        f1_score,
    )
    from sklearn.model_selection import train_test_split
    from sklearn.utils.class_weight import compute_class_weight
    from xgboost import XGBClassifier

    print(f"[1/5] Carregando dados de {args.data_parquet} ...", flush=True)
    t0 = time.time()
    if not args.no_cache and args.cache.exists():
        print(f"      Usando cache {args.cache}", flush=True)
        texts, raw_labels = joblib.load(args.cache)
    else:
        texts, raw_labels = load_dataset(args.data_parquet, args.texts_dir)
        if not args.no_cache:
            args.cache.parent.mkdir(parents=True, exist_ok=True)
            joblib.dump((texts, raw_labels), args.cache)
            print(f"      Cache salvo em {args.cache}", flush=True)
    if args.sample:
        texts, raw_labels = texts[: args.sample], raw_labels[: args.sample]
    n_documents = len(texts)
    print(f"      {n_documents} documentos carregados em {time.time() - t0:.1f}s", flush=True)

    grouped, label_names = build_targets(raw_labels, args.top_n)
    label_to_idx = {lbl: i for i, lbl in enumerate(label_names)}
    y = np.array([label_to_idx[lbl] for lbl in grouped])
    dist = Counter(grouped)
    print("[2/5] Distribuição de classes:")
    for lbl in label_names:
        print(f"      {dist.get(lbl, 0):7d}  {lbl[:70]}")

    idx = np.arange(len(texts))
    train_idx, test_idx = train_test_split(
        idx, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    # Subamostra apenas o TREINO por classe (o teste mantém a distribuição real),
    # para tornar o treino tratável em CPU sem distorcer a avaliação.
    if args.max_per_class:
        rng = np.random.default_rng(args.seed)
        capped: list[int] = []
        for c in np.unique(y[train_idx]):
            members = train_idx[y[train_idx] == c]
            if len(members) > args.max_per_class:
                members = rng.choice(members, size=args.max_per_class, replace=False)
            capped.extend(members.tolist())
        train_idx = np.array(sorted(capped))

    # Indexa por referência (sem copiar todas as strings para um array numpy).
    X_train_txt = [texts[i] for i in train_idx]
    X_test_txt = [texts[i] for i in test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    print(f"[3/5] Treino={len(X_train_txt)}  Teste={len(X_test_txt)}", flush=True)

    vectorizer = TfidfVectorizer(
        max_features=args.max_features,
        ngram_range=(1, 2),
        sublinear_tf=True,
        min_df=20,
        max_df=0.7,
    )
    X_train = vectorizer.fit_transform(X_train_txt)
    X_test = vectorizer.transform(X_test_txt)
    print(f"      TF-IDF: {X_train.shape[1]} features", flush=True)

    classes = np.unique(y_train)
    weights = compute_class_weight("balanced", classes=classes, y=y_train)
    weight_map = {c: w for c, w in zip(classes, weights)}
    sample_weight = np.array([weight_map[c] for c in y_train])

    # Libera os ~3GB de textos crus antes de treinar: a partir daqui só
    # precisamos das matrizes esparsas TF-IDF (pequenas). Evita thrashing de RAM.
    del texts, X_train_txt, X_test_txt, grouped, raw_labels
    gc.collect()

    print(f"[4/5] Treinando XGBoost ({args.n_estimators} árvores, hist)...", flush=True)
    t0 = time.time()
    clf = XGBClassifier(
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        subsample=0.8,
        colsample_bytree=0.8,
        tree_method="hist",
        max_bin=args.max_bin,
        objective="multi:softprob",
        num_class=len(label_names),
        n_jobs=-1,
        random_state=args.seed,
        eval_metric="mlogloss",
    )
    clf.fit(X_train, y_train, sample_weight=sample_weight)
    train_secs = time.time() - t0
    print(f"      Treino concluído em {train_secs:.1f}s", flush=True)

    print("[5/5] Avaliando...", flush=True)
    y_pred = clf.predict(X_test)
    bal_acc = balanced_accuracy_score(y_test, y_pred)
    macro_f1 = f1_score(y_test, y_pred, average="macro")
    report = classification_report(
        y_test, y_pred, target_names=label_names, output_dict=True, zero_division=0
    )
    print(f"      Balanced accuracy: {bal_acc:.4f}")
    print(f"      Macro F1:          {macro_f1:.4f}")
    print(f"      Accuracy:          {report['accuracy']:.4f}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    metadata = {
        "model_type": "tfidf+xgboost",
        "target_column": "PGE_ASSUNTOS_REVISADA",
        "label_names": label_names,
        "top_n": args.top_n,
        "other_label": OTHER_LABEL,
        "nao_taxonomia_label": NAO_NA_TAXONOMIA,
        "n_documents": n_documents,
        "n_train": int(X_train.shape[0]),
        "n_test": int(X_test.shape[0]),
        "max_per_class": args.max_per_class,
        "n_features": int(X_train.shape[1]),
        "tfidf": {
            "max_features": args.max_features,
            "ngram_range": [1, 2],
            "min_df": 20,
            "max_df": 0.7,
            "sublinear_tf": True,
        },
        "class_distribution": {lbl: dist.get(lbl, 0) for lbl in label_names},
    }
    metrics = {
        "balanced_accuracy": bal_acc,
        "macro_f1": macro_f1,
        "accuracy": report["accuracy"],
        "train_seconds": train_secs,
        "per_class": {
            lbl: report[lbl] for lbl in label_names if lbl in report
        },
    }

    joblib.dump(
        {"vectorizer": vectorizer, "clf": clf, "label_names": label_names, "metadata": metadata},
        args.out_dir / "model.joblib",
    )
    (args.out_dir / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.out_dir / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nArtefatos salvos em {args.out_dir}")


if __name__ == "__main__":
    main()
