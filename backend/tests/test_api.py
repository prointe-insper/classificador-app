"""Testes da API (end-to-end do backend com TestClient)."""

import io

from app.config import Settings

# Id do modelo ativo: lido da configuração para que trocar de modelo não exija
# reescrever os testes.
MODEL_ID = Settings().model_id


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


# --------------------------------------------------------------------- models


def test_models_lists_default(client):
    r = client.get("/api/models")
    assert r.status_code == 200
    body = r.json()
    assert len(body["models"]) >= 1
    assert body["default_id"] == MODEL_ID
    ids = [m["id"] for m in body["models"]]
    assert body["default_id"] in ids
    default = next(m for m in body["models"] if m["id"] == body["default_id"])
    assert default["is_default"] is True
    assert default["name"]


def test_predict_echoes_model_id(client):
    r = _upload(client, "icms declarado execucao fiscal divida ativa", threshold=0.0)
    assert r.status_code == 200
    assert r.json()["model_id"] == MODEL_ID


def test_predict_accepts_explicit_model_id(client):
    r = client.post(
        "/api/predict",
        files={"file": ("doc.txt", io.BytesIO(b"icms declarado"), "text/plain")},
        data={"threshold": "0.0", "model_id": MODEL_ID},
    )
    assert r.status_code == 200
    assert r.json()["model_id"] == MODEL_ID


def test_predict_rejects_unknown_model_id(client):
    r = client.post(
        "/api/predict",
        files={"file": ("doc.txt", io.BytesIO(b"icms declarado"), "text/plain")},
        data={"threshold": "0.0", "model_id": "inexistente"},
    )
    assert r.status_code == 422


# ---------------------------------------------------------------- export xlsx

_XLSX_MAGIC = b"PK\x03\x04"  # zip header (.xlsx is a zip)


def test_export_xlsx_returns_spreadsheet(client):
    payload = {
        "rows": [
            {
                "document": "peticao1.pdf",
                "predicted_label": "ICMS Declarado",
                "confidence": 0.91,
                "threshold": 0.5,
                "needs_manual_review": False,
                "decision_label": "ICMS Declarado",
                "source": "pdf",
                "ocr_used": False,
                "char_count": 1200,
                "model_id": MODEL_ID,
                "feedback_status": "incorreto",
                "correct_label": "Servidor",
            },
            {
                "document": "peticao2.pdf",
                "predicted_label": "Servidor",
                "confidence": 0.4,
                "threshold": 0.5,
                "needs_manual_review": True,
                "decision_label": "Revisar manualmente",
            },
        ]
    }
    r = client.post("/api/export-xlsx", json=payload)
    assert r.status_code == 200
    assert (
        r.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    cd = r.headers["content-disposition"]
    assert "attachment" in cd and ".xlsx" in cd
    assert r.headers["x-filename"].startswith("classificacoes_")
    assert r.content[:4] == _XLSX_MAGIC


def test_export_xlsx_rejects_empty(client):
    r = client.post("/api/export-xlsx", json={"rows": []})
    assert r.status_code == 400
