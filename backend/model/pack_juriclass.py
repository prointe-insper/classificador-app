"""Empacota o modelo treinado no ``juriclass`` no formato de bundle da aplicação.

O benchmark do `juriclass <https://github.com/prointe-insper/juriclass>`_ salva
cada run em três arquivos soltos:

- ``{run_id}_classifier.joblib`` — o estimador (aqui, ``RandomForestClassifier``);
- ``{run_id}_tfidf.joblib`` — o ``TfidfVectorizer`` ajustado sobre *chunks*;
- ``{run_id}_labels.json`` — lista de rótulos indexada pela classe inteira.

O backend, por outro lado, espera um único ``model.joblib`` com o dict
``{vectorizer, clf, label_names, metadata}``. Este script faz a conversão e
grava no ``metadata`` as chaves que o ``ModelService`` usa para reproduzir o
pipeline de inferência do juriclass: ``chunking``, ``preprocess`` e
``explanation``.

Uso::

    uv run python -m model.pack_juriclass \
        --src ../../juriclass-webapp/model \
        --dest model/artifacts/model.joblib
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"

# Parâmetros do FixedChunker do juriclass (juriclass/src/juriclass/chunking/fixed.py).
# O vocabulário do TF-IDF foi ajustado com estes valores: mudá-los aqui faz a
# inferência divergir do treino.
CHUNK_WORDS = 100
CHUNK_OVERLAP = 50


def build_bundle(src: Path, *, target_column: str, notes: str) -> dict[str, Any]:
    """Lê os três artefatos do juriclass e monta o bundle do backend."""
    import joblib

    classifier = joblib.load(src / "classifier.joblib")
    vectorizer = joblib.load(src / "tfidf.joblib")
    label_names = json.loads((src / "labels.json").read_text(encoding="utf-8"))

    n_features = int(len(vectorizer.get_feature_names_out()))
    metadata: dict[str, Any] = {
        "model_type": "fixed_chunks+tfidf+random_forest",
        "target_column": target_column,
        "label_names": list(label_names),
        "n_features": n_features,
        # O juriclass vetoriza chunks de tamanho fixo e usa a MÉDIA dos vetores
        # como representação do documento.
        "chunking": {
            "strategy": "fixed",
            "chunk_words": CHUNK_WORDS,
            "overlap": CHUNK_OVERLAP,
            "aggregation": "mean",
        },
        # O juriclass vetoriza o texto cru (o próprio TfidfVectorizer faz o
        # lowercase); aplicar a limpeza do app mudaria a tokenização.
        "preprocess": "raw",
        # RandomForest não tem o TreeSHAP barato do XGBoost: a explicação é a
        # mesma aproximação usada no juriclass-webapp.
        "explanation": "tfidf_x_importances",
        "source_repo": "prointe-insper/juriclass",
        "notes": notes,
    }
    return {
        "vectorizer": vectorizer,
        "clf": classifier,
        "label_names": list(label_names),
        "metadata": metadata,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--src",
        type=Path,
        required=True,
        help="Diretório com classifier.joblib, tfidf.joblib e labels.json.",
    )
    parser.add_argument("--dest", type=Path, default=ARTIFACTS_DIR / "model.joblib")
    parser.add_argument(
        "--target-column",
        default="PGE_ASSUNTOS_REVISADA",
        help="Coluna-alvo usada no treino.",
    )
    parser.add_argument(
        "--notes",
        default="Run do benchmark project1_core do juriclass (fixed_chunks/tfidf/random_forest).",
    )
    args = parser.parse_args()

    import joblib

    bundle = build_bundle(args.src, target_column=args.target_column, notes=args.notes)
    args.dest.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.dest, compress=3)
    meta = bundle["metadata"]
    print(f"Bundle gravado em {args.dest}")
    print(f"  classes:  {len(bundle['label_names'])}")
    print(f"  features: {meta['n_features']}")
    print(f"  tipo:     {meta['model_type']}")


if __name__ == "__main__":
    main()
