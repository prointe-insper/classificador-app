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


# --------------------------------------------------------------------------
# Pipeline de chunks (formato do juriclass)
# --------------------------------------------------------------------------


def test_chunk_text_texto_vazio():
    from app.services.model import chunk_text

    assert chunk_text("") == [""]
    assert chunk_text("   ") == [""]


def test_chunk_text_menor_que_a_janela():
    from app.services.model import chunk_text

    palavras = " ".join(str(i) for i in range(30))
    assert chunk_text(palavras, 100, 50) == [palavras]


def test_chunk_text_janela_deslizante():
    """250 palavras, janela 100 e passo 50 devem render 4 chunks sobrepostos."""
    from app.services.model import chunk_text

    palavras = [str(i) for i in range(250)]
    chunks = chunk_text(" ".join(palavras), 100, 50)
    assert len(chunks) == 4
    assert chunks[0].split() == palavras[0:100]
    assert chunks[1].split() == palavras[50:150]
    assert chunks[-1].split() == palavras[150:250]


def test_transform_chunkado_devolve_media_densa(chunked_model_service: ModelService):
    import numpy as np

    from app.services.model import chunk_text

    texto = " ".join(["icms declarado nota fiscal contribuinte"] * 60)
    features = chunked_model_service.transform(texto)
    assert features.shape[0] == 1
    esperado = (
        chunked_model_service.vectorizer.transform(chunk_text(texto, 100, 50))
        .toarray()
        .mean(axis=0)
    )
    np.testing.assert_allclose(features[0], esperado)


def test_preprocess_raw_nao_limpa_o_texto(chunked_model_service: ModelService):
    """Com ``preprocess: raw`` o texto chega cru ao vetorizador."""
    assert chunked_model_service.metadata["preprocess"] == "raw"
    assert chunked_model_service._prepare("Texto  COM   Ruído") == "Texto  COM   Ruído"


def test_predict_chunkado_distribuicao_valida(chunked_model_service: ModelService):
    pred = chunked_model_service.predict(
        " ".join(["icms declarado nota fiscal contribuinte estado"] * 60)
    )
    assert pred.label in chunked_model_service.label_names
    assert pytest.approx(sum(pred.probabilities.values()), abs=1e-4) == 1.0
