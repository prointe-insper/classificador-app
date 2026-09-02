"""Testes da explicabilidade (TreeSHAP e importâncias do RandomForest)."""

from app.services.explain import explain
from app.services.model import ModelService


def test_explain_returns_tokens_present_in_text(model_service: ModelService):
    text = "icms declarado nao pago execucao fiscal divida ativa contribuinte"
    contribs = explain(model_service, text, "ICMS Declarado", top_k=8)
    assert len(contribs) > 0
    assert len(contribs) <= 8
    cleaned = text.lower()
    # Cada termo explicado é um uni/bi-grama presente no documento.
    for c in contribs:
        first = c.token.split()[0]
        assert first in cleaned


def test_explain_sorted_by_absolute_weight(model_service: ModelService):
    text = "servidor publico estatutario aposentadoria proventos gratificacao verba"
    contribs = explain(model_service, text, "Servidor", top_k=10)
    weights = [abs(c.weight) for c in contribs]
    assert weights == sorted(weights, reverse=True)


def test_explain_empty_text_returns_empty(model_service: ModelService):
    assert explain(model_service, "zzz_inexistente_token_xyz", "Outros") == []


# --------------------------------------------------------------------------
# Caminho tfidf_x_importances (RandomForest do juriclass)
# --------------------------------------------------------------------------


def test_explain_usa_importancias_quando_o_bundle_pede(chunked_model_service: ModelService):
    assert chunked_model_service.explanation_method == "tfidf_x_importances"
    texto = " ".join(["icms declarado nota fiscal contribuinte estado"] * 60)
    contribs = explain(chunked_model_service, texto, "ICMS Declarado", top_k=5)
    assert 0 < len(contribs) <= 5
    # Peso TF-IDF (>= 0) x importância (>= 0): nunca negativo.
    assert all(c.weight > 0 for c in contribs)
    pesos = [c.weight for c in contribs]
    assert pesos == sorted(pesos, reverse=True)


def test_explain_importancias_filtra_stopwords(chunked_model_service: ModelService):
    """Conectivos comuns não podem dominar o destaque, como no juriclass-webapp."""
    texto = " ".join(["o de a que icms declarado do contribuinte para"] * 60)
    tokens = {c.token for c in explain(chunked_model_service, texto, "ICMS Declarado", top_k=12)}
    assert tokens.isdisjoint({"o", "de", "a", "que", "do", "para"})


def test_explain_termos_ocorrem_no_documento(chunked_model_service: ModelService):
    texto = " ".join(["servidor publico estatutario aposentadoria proventos"] * 60)
    contribs = explain(chunked_model_service, texto, "Servidor", top_k=8)
    for c in contribs:
        assert c.token in texto
