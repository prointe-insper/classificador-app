"""Explicabilidade via TreeSHAP sobre o modelo XGBoost em espaço TF-IDF.

Para a classe escolhida, calculamos os valores SHAP (contribuição exata de cada
feature) e mapeamos as *features* (uni/bi-gramas) de volta aos termos presentes
no documento. Retornamos os termos com maior contribuição absoluta — é a
"interpretabilidade" exibida no frontend (trechos/termos que pesaram na decisão).

TreeSHAP é exato e rápido para modelos de árvore (ao contrário do LIME, que é
amostral/aproximado). Mantemos um *fallback* para o ``pred_contribs`` nativo do
XGBoost caso o ``shap`` não esteja disponível em algum ambiente.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.services.model import ModelService


@dataclass
class TokenContribution:
    """Contribuição de um termo para a classe prevista."""

    token: str
    weight: float


def explain(
    model: ModelService,
    text: str,
    predicted_label: str,
    *,
    top_k: int = 12,
) -> list[TokenContribution]:
    """Retorna os ``top_k`` termos mais influentes para ``predicted_label``."""
    features = model.transform(text)
    nz = features.nonzero()[1]
    if nz.size == 0:
        return []

    class_idx = model.label_names.index(predicted_label)
    feature_names = model.vectorizer.get_feature_names_out()

    contribs = _shap_contributions(model, features, class_idx)
    if contribs is None:
        return []

    scored = [(int(j), float(contribs[j])) for j in nz]
    scored.sort(key=lambda kv: abs(kv[1]), reverse=True)

    out: list[TokenContribution] = []
    for j, w in scored[:top_k]:
        if w == 0.0:
            continue
        out.append(TokenContribution(token=str(feature_names[j]), weight=w))
    return out


def _shap_contributions(model: ModelService, features, class_idx: int) -> np.ndarray | None:
    """Vetor de contribuições SHAP por feature para a classe ``class_idx``."""
    dense = features.toarray()
    try:
        import shap

        explainer = shap.TreeExplainer(model.clf)
        values = explainer.shap_values(dense)
        return _select_class(values, class_idx)
    except Exception:
        return _native_contributions(model, dense, class_idx)


def _select_class(values, class_idx: int) -> np.ndarray:
    """Normaliza a saída do SHAP para o vetor de features da classe escolhida."""
    if isinstance(values, list):
        return np.asarray(values[class_idx])[0]
    arr = np.asarray(values)
    if arr.ndim == 3:  # (n_samples, n_features, n_classes)
        return arr[0, :, class_idx]
    return arr[0]


def _native_contributions(model: ModelService, dense: np.ndarray, class_idx: int) -> np.ndarray | None:
    """Fallback: usa ``pred_contribs`` nativo do XGBoost (também TreeSHAP)."""
    try:
        import xgboost as xgb

        booster = model.clf.get_booster()
        dmatrix = xgb.DMatrix(dense)
        contribs = booster.predict(dmatrix, pred_contribs=True)
    except Exception:  # pragma: no cover - ambiente sem xgboost booster
        return None
    arr = np.asarray(contribs)
    n_classes = len(model.label_names)
    if arr.ndim == 3:  # (n_samples, n_classes, n_features+1)
        return arr[0, class_idx, :-1]
    if arr.ndim == 2 and arr.shape[1] % n_classes == 0:
        per = arr.shape[1] // n_classes
        block = arr[0, class_idx * per : (class_idx + 1) * per]
        return block[:-1]
    return arr[0, :-1]


__all__ = ["explain", "TokenContribution"]
