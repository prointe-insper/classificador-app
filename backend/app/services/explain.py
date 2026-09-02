"""Explicabilidade dos termos que pesaram na decisão do classificador.

Há dois métodos, escolhidos pela chave ``explanation`` do bundle:

``shap`` (padrão, modelos XGBoost)
    TreeSHAP sobre a classe prevista: contribuição exata de cada feature,
    com sinal (empurra a favor ou contra a classe). Mantemos um *fallback*
    para o ``pred_contribs`` nativo do XGBoost quando o ``shap`` não está
    disponível no ambiente.

``tfidf_x_importances`` (modelos RandomForest)
    Peso TF-IDF do documento × importância global do RandomForest. É a mesma
    aproximação usada no ``juriclass-webapp``, e é uma aproximação mesmo: mede
    "o documento tem esse termo" combinado com "esse termo importa para o
    modelo em geral", não a contribuição para a classe prevista. TreeSHAP numa
    floresta de 200 árvores sobre 5.000 features é caro demais para o tempo de
    resposta de um upload.

Em ambos os casos devolvemos os termos com maior contribuição absoluta entre os
que ocorrem no documento.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.services.model import ModelService, to_dense

# Conectivos que sobrevivem ao TF-IDF do juriclass (que filtra por frequência,
# não por stopword) e dominariam o destaque por aparecerem dezenas de vezes num
# documento real. Lista fixa, espelhada do juriclass-webapp para que os termos
# destacados sejam os mesmos nos dois lugares.
_PORTUGUESE_STOPWORDS = {
    "a", "à", "às", "ao", "aos", "aquela", "aquelas", "aquele", "aqueles", "aquilo",
    "as", "até", "com", "como", "da", "das", "de", "dela", "delas", "dele", "deles",
    "depois", "do", "dos", "e", "é", "ela", "elas", "ele", "eles", "em", "entre",
    "era", "essa", "essas", "esse", "esses", "esta", "está", "estas", "este",
    "estes", "eu", "foi", "for", "isso", "isto", "já", "lhe", "lhes", "mais",
    "mas", "me", "mesmo", "meu", "meus", "minha", "minhas", "muito", "na", "não",
    "nas", "nem", "no", "nos", "nós", "nossa", "nossas", "nosso", "nossos", "num",
    "numa", "o", "os", "ou", "para", "pela", "pelas", "pelo", "pelos", "por",
    "qual", "quando", "que", "quem", "se", "sem", "seu", "seus", "só", "sua",
    "suas", "também", "te", "tu", "tua", "tuas", "um", "uma", "você", "vocês",
    "vos",
}


@dataclass
class TokenContribution:
    """Contribuição de um termo para a decisão."""

    token: str
    weight: float


def explain(
    model: ModelService,
    text: str,
    predicted_label: str,
    *,
    top_k: int = 12,
) -> list[TokenContribution]:
    """Retorna os ``top_k`` termos mais influentes do documento."""
    dense = to_dense(model.transform(text))
    nz = dense.nonzero()[1]
    if nz.size == 0:
        return []

    feature_names = model.vectorizer.get_feature_names_out()

    if model.explanation_method == "tfidf_x_importances":
        contribs = _importance_contributions(model, dense)
        if contribs is None:
            return []
        scored = [
            (int(j), float(contribs[j]))
            for j in nz
            if str(feature_names[j]).lower() not in _PORTUGUESE_STOPWORDS
        ]
    else:
        class_idx = model.label_names.index(predicted_label)
        contribs = _shap_contributions(model, dense, class_idx)
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


def _importance_contributions(model: ModelService, dense: np.ndarray) -> np.ndarray | None:
    """Peso TF-IDF do documento × importância global do estimador."""
    importances = getattr(model.clf, "feature_importances_", None)
    if importances is None:
        return None
    return np.asarray(dense)[0] * np.asarray(importances)


def _shap_contributions(model: ModelService, dense: np.ndarray, class_idx: int) -> np.ndarray | None:
    """Vetor de contribuições SHAP por feature para a classe ``class_idx``."""
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
