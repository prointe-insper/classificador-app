"""Exporta o modelo para um formato que roda no navegador, sem servidor.

O bundle do backend é um pickle do scikit-learn: só carrega em Python. Este
script traduz o que importa para a inferência em estruturas planas (arrays
tipados em base64 dentro de um JSON), que o TypeScript lê direto.

O que é exportado:

- **Vocabulário e IDF** do ``TfidfVectorizer``. A tokenização não vai junto:
  ela é reimplementada no cliente e precisa casar com o ``token_pattern`` do
  sklearn (ver ``webapp/src/model/tfidf.ts``).
- **Floresta**, nó a nó, em arrays paralelos. As distribuições de classe ficam
  só nas folhas, e já **normalizadas**: o ``tree_.value`` do sklearn mudou de
  contagem para fração entre versões, e normalizar aqui torna o arquivo
  independente dessa diferença.

Uso::

    uv run python -m model.export_web --out ../webapp/public/model-web.json
"""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path

import numpy as np

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"


def _b64(array: np.ndarray, dtype: str) -> str:
    return base64.b64encode(np.ascontiguousarray(array, dtype=dtype).tobytes()).decode("ascii")


def export_forest(clf) -> dict:
    """Achata a floresta em arrays paralelos indexados por nó global."""
    feature: list[int] = []
    threshold: list[float] = []
    left: list[int] = []
    right: list[int] = []
    leaf_index: list[int] = []       # -1 em nó interno; índice na tabela de folhas
    leaf_values: list[np.ndarray] = []
    tree_offsets: list[int] = [0]

    for est in clf.estimators_:
        tree = est.tree_
        base = len(feature)
        for node in range(tree.node_count):
            filho_esq = int(tree.children_left[node])
            filho_dir = int(tree.children_right[node])
            eh_folha = filho_esq == -1
            feature.append(-1 if eh_folha else int(tree.feature[node]))
            threshold.append(0.0 if eh_folha else float(tree.threshold[node]))
            left.append(-1 if eh_folha else base + filho_esq)
            right.append(-1 if eh_folha else base + filho_dir)
            if eh_folha:
                bruto = np.asarray(tree.value[node], dtype=np.float64).ravel()
                total = bruto.sum()
                leaf_index.append(len(leaf_values))
                leaf_values.append(bruto / total if total > 0 else bruto)
            else:
                leaf_index.append(-1)
        tree_offsets.append(len(feature))

    return {
        "n_trees": len(clf.estimators_),
        "n_classes": int(clf.n_classes_),
        "n_nodes": len(feature),
        "n_leaves": len(leaf_values),
        "tree_offsets": _b64(np.array(tree_offsets), "int32"),
        "feature": _b64(np.array(feature), "int32"),
        "threshold": _b64(np.array(threshold), "float64"),
        "left": _b64(np.array(left), "int32"),
        "right": _b64(np.array(right), "int32"),
        "leaf_index": _b64(np.array(leaf_index), "int32"),
        "leaf_values": _b64(np.vstack(leaf_values).ravel(), "float32"),
    }


def build_payload(bundle: dict) -> dict:
    vec = bundle["vectorizer"]
    clf = bundle["clf"]
    meta = bundle.get("metadata", {})
    chunking = meta.get("chunking", {})

    if vec.norm != "l2":
        raise SystemExit(f"norm={vec.norm!r} não suportado no cliente (só l2).")
    if vec.analyzer != "word" or vec.ngram_range != (1, 1):
        raise SystemExit("o cliente só implementa analyzer='word' com unigramas.")
    if vec.strip_accents is not None:
        raise SystemExit("strip_accents não é replicado no cliente.")

    return {
        "format": "classificador-web/1",
        "model_type": meta.get("model_type", ""),
        "labels": list(bundle["label_names"]),
        "chunking": {
            "chunk_words": int(chunking.get("chunk_words", 100)),
            "overlap": int(chunking.get("overlap", 50)),
        },
        "tfidf": {
            "terms": [str(t) for t in vec.get_feature_names_out()],
            "idf": _b64(vec.idf_, "float64"),
            "sublinear_tf": bool(vec.sublinear_tf),
            "lowercase": bool(vec.lowercase),
            "token_pattern": vec.token_pattern,
        },
        "forest": export_forest(clf),
        # Importância global por feature: é o que a explicação multiplica pelo
        # peso TF-IDF do documento, como no backend.
        "feature_importances": _b64(clf.feature_importances_, "float64"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=ARTIFACTS_DIR / "model.joblib")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    import joblib

    payload = build_payload(joblib.load(args.model))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    forest = payload["forest"]
    tamanho = args.out.stat().st_size / 1024**2
    print(f"Gravado em {args.out} ({tamanho:.2f} MB)")
    print(f"  {len(payload['labels'])} classes | {len(payload['tfidf']['terms'])} termos")
    print(f"  {forest['n_trees']} árvores | {forest['n_nodes']} nós | {forest['n_leaves']} folhas")


if __name__ == "__main__":
    main()
