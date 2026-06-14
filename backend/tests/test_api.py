"""Testes da API (end-to-end do backend com TestClient)."""

import io


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is True


def test_labels(client):
    r = client.get("/api/labels")
    assert r.status_code == 200
    assert r.json()["labels"] == ["ICMS Declarado", "Servidor", "Outros"]


def test_model_info(client):
    r = client.get("/api/model-info")
    assert r.status_code == 200
    body = r.json()
    assert body["model_type"] == "tfidf+xgboost"
    assert body["n_documents"] == 12
    assert "ICMS Declarado" in body["label_names"]


def _upload(client, text: str, threshold=None):
    data = {}
    if threshold is not None:
        data["threshold"] = str(threshold)
    return client.post(
        "/api/predict",
        files={"file": ("doc.txt", io.BytesIO(text.encode("utf-8")), "text/plain")},
        data=data,
    )


def test_predict_accepts_class_when_confident(client):
    r = _upload(
        client,
        "icms declarado nao pago execucao fiscal divida ativa contribuinte imposto",
        threshold=0.0,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["predicted_label"] in ["ICMS Declarado", "Servidor", "Outros"]
    assert body["needs_manual_review"] is False
    assert body["decision_label"] == body["predicted_label"]
    assert len(body["probabilities"]) == 3
    # Probabilidades ordenadas desc.
    probs = [p["probability"] for p in body["probabilities"]]
    assert probs == sorted(probs, reverse=True)
    assert body["char_count"] > 0
    assert body["source"] == "text"


def test_predict_flags_manual_review_with_high_threshold(client):
    r = _upload(client, "icms declarado execucao fiscal", threshold=1.0)
    assert r.status_code == 200
    body = r.json()
    assert body["needs_manual_review"] is True
    assert body["decision_label"] == "Revisar manualmente"


def test_predict_includes_explanation(client):
    r = _upload(client, "servidor estatutario aposentadoria proventos gratificacao verba", threshold=0.0)
    body = r.json()
    assert isinstance(body["explanation"], list)
    assert len(body["explanation"]) > 0
    assert {"token", "weight"} <= set(body["explanation"][0])


def test_predict_rejects_invalid_threshold(client):
    r = _upload(client, "texto qualquer", threshold=1.5)
    assert r.status_code == 422


def test_predict_rejects_empty_file(client):
    r = client.post(
        "/api/predict",
        files={"file": ("doc.txt", io.BytesIO(b""), "text/plain")},
    )
    assert r.status_code == 400


def test_predict_rejects_unsupported_format(client):
    r = client.post(
        "/api/predict",
        files={"file": ("planilha.xlsx", io.BytesIO(b"data"), "application/octet-stream")},
    )
    assert r.status_code == 422
