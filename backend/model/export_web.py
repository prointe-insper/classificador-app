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


def export_xgboost(clf) -> dict:
    """Achata o booster do XGBoost em arrays paralelos indexados por nó global.

    Três detalhes do XGBoost que precisam atravessar para o cliente, sob pena de
    a predição divergir:

    - **Ausência é ``missing``, não zero.** O backend prediz sobre a matriz
      esparsa do TF-IDF, e o XGBoost trata entrada ausente como valor faltante,
      seguindo o ramo ``missing`` do nó. Um cliente que montasse um vetor denso
      com zeros desceria pelo ramo errado na maioria dos nós.
    - **A comparação é estrita** (``<``), ao contrário do ``<=`` do sklearn.
    - **``base_score`` é um vetor por classe**, não um escalar. Fosse escalar,
      cairia fora no softmax; sendo vetor, entra na margem de cada classe.

    A ordem das árvores é ``rodada * n_classes + classe``, então a classe da
    árvore ``t`` é ``t % n_classes``.
    """
    import json

    booster = clf.get_booster()
    n_classes = int(clf.n_classes_)

    feature: list[int] = []
    threshold: list[float] = []
    yes: list[int] = []
    no: list[int] = []
    missing: list[int] = []
    leaf_value: list[float] = []
    tree_offsets: list[int] = [0]

    for bruto in booster.get_dump(dump_format="json"):
        raiz = json.loads(bruto)
        base = len(feature)
        # O dump é aninhado e os filhos são referenciados por `nodeid`; achata
        # numa lista indexada por nodeid para converter em índice global.
        por_id: dict[int, dict] = {}

        def visitar(no_: dict) -> None:
            por_id[int(no_["nodeid"])] = no_
            for filho in no_.get("children", []):
                visitar(filho)

        visitar(raiz)
        for nodeid in range(max(por_id) + 1):
            no_ = por_id.get(nodeid)
            if no_ is None or "leaf" in (no_ or {}):
                feature.append(-1)
                threshold.append(0.0)
                yes.append(-1)
                no.append(-1)
                missing.append(-1)
                leaf_value.append(float(no_["leaf"]) if no_ else 0.0)
                continue
            feature.append(int(str(no_["split"]).lstrip("f")))
            threshold.append(float(no_["split_condition"]))
            yes.append(base + int(no_["yes"]))
            no.append(base + int(no_["no"]))
            missing.append(base + int(no_["missing"]))
            leaf_value.append(0.0)
        tree_offsets.append(len(feature))

    config = json.loads(booster.save_config())
    base_score = json.loads(config["learner"]["learner_model_param"]["base_score"])
    if not isinstance(base_score, list):
        base_score = [float(base_score)] * n_classes

    return {
        "kind": "xgboost",
        "n_trees": len(tree_offsets) - 1,
        "n_classes": n_classes,
        "n_nodes": len(feature),
        "tree_offsets": _b64(np.array(tree_offsets), "int32"),
        "feature": _b64(np.array(feature), "int32"),
        "threshold": _b64(np.array(threshold), "float64"),
        "yes": _b64(np.array(yes), "int32"),
        "no": _b64(np.array(no), "int32"),
        "missing": _b64(np.array(missing), "int32"),
        "leaf_value": _b64(np.array(leaf_value), "float64"),
        "base_score": _b64(np.array(base_score), "float64"),
    }


def export_forest(clf) -> dict:
    """Achata a floresta do sklearn em arrays paralelos indexados por nó global."""
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
        "kind": "sklearn_forest",
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
    if vec.analyzer != "word":
        raise SystemExit("o cliente só implementa analyzer='word'.")
    if vec.ngram_range[0] != 1 or vec.ngram_range[1] > 2:
        raise SystemExit(f"ngram_range={vec.ngram_range} fora do que o cliente implementa.")
    if vec.strip_accents is not None:
        raise SystemExit("strip_accents não é replicado no cliente.")
    if vec.stop_words is not None:
        raise SystemExit("stop_words do vetorizador não é replicado no cliente.")

    tipo = type(clf).__name__
    if tipo == "RandomForestClassifier":
        forest = export_forest(clf)
    elif tipo == "XGBClassifier":
        forest = export_xgboost(clf)
    else:
        raise SystemExit(f"estimador não suportado no cliente: {tipo}")

    return {
        "format": "classificador-web/2",
        "model_type": meta.get("model_type", ""),
        "labels": list(bundle["label_names"]),
        # Sem a chave `chunking` o documento é vetorizado inteiro, como no
        # ModelService: é o caso do modelo v1.
        "chunking": (
            {
                "chunk_words": int(chunking.get("chunk_words", 100)),
                "overlap": int(chunking.get("overlap", 50)),
            }
            if chunking
            else None
        ),
        # "raw" entrega o texto cru ao vetorizador; "clean" replica o
        # clean_for_model do backend (normaliza e minúscula).
        "preprocess": meta.get("preprocess", "clean"),
        "tfidf": {
            "terms": [str(t) for t in vec.get_feature_names_out()],
            "idf": _b64(vec.idf_, "float64"),
            "sublinear_tf": bool(vec.sublinear_tf),
            "lowercase": bool(vec.lowercase),
            "ngram_max": int(vec.ngram_range[1]),
            "token_pattern": vec.token_pattern,
        },
        "forest": forest,
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
    resumo = f"  {forest['kind']}: {forest['n_trees']} árvores | {forest['n_nodes']} nós"
    if "n_leaves" in forest:
        resumo += f" | {forest['n_leaves']} folhas"
    print(resumo)


if __name__ == "__main__":
    main()
