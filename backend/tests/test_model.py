"""Testes do serviço de modelo."""

import pytest

from app.services.model import ModelNotLoadedError, ModelService


def test_load_missing_artifact_raises(tmp_path):
    svc = ModelService(tmp_path / "inexistente.joblib")
    with pytest.raises(ModelNotLoadedError):
        svc.load()


def test_predict_without_load_raises(tmp_path):
    svc = ModelService(tmp_path / "x.joblib")
    with pytest.raises(ModelNotLoadedError):
        svc.predict("texto")


def test_label_names(model_service: ModelService):
    assert model_service.label_names == ["ICMS Declarado", "Servidor", "Outros"]


def test_predict_returns_valid_distribution(model_service: ModelService):
    pred = model_service.predict("icms declarado nao pago execucao fiscal divida ativa")
    assert pred.label in model_service.label_names
    assert 0.0 <= pred.confidence <= 1.0
    # Probabilidades somam ~1 e cobrem todas as classes.
    assert set(pred.probabilities) == set(model_service.label_names)
    assert pytest.approx(sum(pred.probabilities.values()), abs=1e-4) == 1.0


def test_predict_icms_text(model_service: ModelService):
    pred = model_service.predict(
        "cobranca de icms declarado pelo contribuinte imposto estadual mercadoria"
    )
    assert pred.label == "ICMS Declarado"


def test_predict_servidor_text(model_service: ModelService):
    pred = model_service.predict(
        "servidor publico estatutario aposentadoria proventos gratificacao verba"
    )
    assert pred.label == "Servidor"
