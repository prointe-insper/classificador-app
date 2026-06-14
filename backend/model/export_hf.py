"""Prepara um diretório pronto para publicação no Hugging Face Hub.

Gera ``hf_export/`` com:

- ``model.joblib``   — o artefato treinado.
- ``metadata.json`` / ``metrics.json`` — descrição e métricas.
- ``README.md``      — *model card* (gerado a partir dos metadados/métricas).
- ``inference.py``   — exemplo mínimo de uso.
- ``requirements.txt`` — dependências para inferência.

Publicação (quando autorizado)::

    uv run python -m model.export_hf
    huggingface-cli upload prointe-insper/classificador-assuntos-pge hf_export .
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
EXPORT_DIR = Path(__file__).resolve().parents[2] / "hf_export"

INFERENCE_EXAMPLE = '''\
"""Exemplo de inferência com o modelo do Hugging Face."""

import joblib
import numpy as np

bundle = joblib.load("model.joblib")
vectorizer, clf, labels = bundle["vectorizer"], bundle["clf"], bundle["label_names"]

texto = "ICMS declarado e não pago, execução fiscal de dívida ativa."
proba = clf.predict_proba(vectorizer.transform([texto.lower()]))[0]
idx = int(np.argmax(proba))
print("Classe:", labels[idx], f"({proba[idx]:.1%})")
'''

REQUIREMENTS = "scikit-learn>=1.4\nxgboost>=2.0\njoblib>=1.3\nnumpy>=1.26\n"


def _model_card(metadata: dict, metrics: dict) -> str:
    labels = metadata.get("label_names", [])
    dist = metadata.get("class_distribution", {})
    rows = "\n".join(f"| {l} | {dist.get(l, '?')} |" for l in labels)
    return f"""---
language: pt
license: other
tags:
  - text-classification
  - legal
  - portuguese
  - pge-sp
pipeline_tag: text-classification
---

# Classificador de Assuntos Jurídicos — PGE-SP

Classificador de assuntos de petições iniciais da Procuradoria Geral do Estado
de São Paulo (PGE-SP), desenvolvido com o Insper (projeto FAPESP). Baseado na
abordagem `tfidf_xgboost` do pacote [juriclass](https://github.com/tiagoft/juriclass),
ajustado à taxonomia revisada da PGE.

- **Tipo:** {metadata.get('model_type', 'tfidf+xgboost')}
- **Alvo:** `{metadata.get('target_column', 'PGE_ASSUNTOS_REVISADA')}` (top-{metadata.get('top_n', 10)} + `NÃO_NA_TAXONOMIA` + `Outros`)
- **Base rotulada:** {metadata.get('n_documents', '?')} documentos
- **Split:** {metadata.get('n_train', '?')} treino / {metadata.get('n_test', '?')} teste
- **Features TF-IDF:** {metadata.get('n_features', '?')}

## Métricas (conjunto de teste)

- Balanced accuracy: **{metrics.get('balanced_accuracy', float('nan')):.4f}**
- Macro F1: **{metrics.get('macro_f1', float('nan')):.4f}**
- Accuracy: **{metrics.get('accuracy', float('nan')):.4f}**

## Classes

| Rótulo | Nº de documentos |
| --- | --- |
{rows}

## Uso

```python
import joblib, numpy as np
bundle = joblib.load("model.joblib")
v, clf, labels = bundle["vectorizer"], bundle["clf"], bundle["label_names"]
proba = clf.predict_proba(v.transform(["texto da petição".lower()]))[0]
print(labels[int(np.argmax(proba))])
```

> ⚠️ Modelo treinado com dados sensíveis sob LGPD. Uso restrito ao escopo do projeto.
"""


def main() -> None:
    model_path = ARTIFACTS_DIR / "model.joblib"
    if not model_path.exists():
        raise SystemExit(f"Artefato não encontrado: {model_path}. Treine o modelo antes.")

    metadata = json.loads((ARTIFACTS_DIR / "metadata.json").read_text(encoding="utf-8"))
    metrics_path = ARTIFACTS_DIR / "metrics.json"
    metrics = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.exists() else {}

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(model_path, EXPORT_DIR / "model.joblib")
    shutil.copy2(ARTIFACTS_DIR / "metadata.json", EXPORT_DIR / "metadata.json")
    if metrics_path.exists():
        shutil.copy2(metrics_path, EXPORT_DIR / "metrics.json")
    (EXPORT_DIR / "README.md").write_text(_model_card(metadata, metrics), encoding="utf-8")
    (EXPORT_DIR / "inference.py").write_text(INFERENCE_EXAMPLE, encoding="utf-8")
    (EXPORT_DIR / "requirements.txt").write_text(REQUIREMENTS, encoding="utf-8")
    print(f"Exportado para {EXPORT_DIR}")


if __name__ == "__main__":
    main()
