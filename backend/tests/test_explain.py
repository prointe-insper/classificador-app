"""Testes da explicabilidade (TreeSHAP)."""

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
