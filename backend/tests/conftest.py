"""Fixtures de teste: constrói um modelo minúsculo e um cliente da API."""

from __future__ import annotations

import os
from pathlib import Path

import joblib
import pytest

# Documentos sintéticos para um modelo de brinquedo com 3 classes.
_SAMPLES: list[tuple[str, str]] = [
    ("imposto icms declarado e nao pago execucao fiscal divida ativa", "ICMS Declarado"),
    ("icms declarado nota fiscal contribuinte recolhimento mensal", "ICMS Declarado"),
    ("cobranca de icms declarado pelo proprio contribuinte estado", "ICMS Declarado"),
    ("icms declarado imposto estadual mercadoria circulacao", "ICMS Declarado"),
    ("servidor publico estatutario gratificacao verba remuneratoria salario", "Servidor"),
    ("aposentadoria do servidor estatutario proventos pensao", "Servidor"),
    ("adicional por tempo de servico quinquenio sexta parte servidor", "Servidor"),
    ("vencimentos do funcionario publico reajuste salarial carreira", "Servidor"),
    ("contrato administrativo licitacao residual diversos pedido generico", "Outros"),
    ("acao residual variada sem assunto especifico processo comum", "Outros"),
    ("indenizacao por danos materiais e morais responsabilidade civil", "Outros"),
    ("obrigacao de fazer pedido residual fazenda publica estadual", "Outros"),
]


def _build_tiny_model(path: Path) -> None:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from xgboost import XGBClassifier

    texts = [t for t, _ in _SAMPLES]
    labels = [l for _, l in _SAMPLES]
    label_names = ["ICMS Declarado", "Servidor", "Outros"]
    label_to_idx = {l: i for i, l in enumerate(label_names)}
    y = [label_to_idx[l] for l in labels]

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
    X = vectorizer.fit_transform(texts)
    clf = XGBClassifier(
        n_estimators=30,
        max_depth=3,
        tree_method="hist",
        objective="multi:softprob",
        num_class=len(label_names),
        eval_metric="mlogloss",
        random_state=0,
    )
    clf.fit(X, y)

    metadata = {
        "model_type": "tfidf+xgboost",
        "target_column": "PGE_ASSUNTOS_REVISADA",
        "label_names": label_names,
        "n_documents": len(texts),
        "n_features": int(X.shape[1]),
        "class_distribution": {l: labels.count(l) for l in label_names},
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {"vectorizer": vectorizer, "clf": clf, "label_names": label_names, "metadata": metadata},
        path,
    )


@pytest.fixture(scope="session")
def tiny_model_path(tmp_path_factory) -> Path:
    """Caminho para um artefato de modelo minúsculo (construído uma vez por sessão)."""
    path = tmp_path_factory.mktemp("model") / "model.joblib"
    _build_tiny_model(path)
    return path


@pytest.fixture
def model_service(tiny_model_path: Path):
    """ModelService carregado com o modelo de brinquedo."""
    from app.services.model import ModelService

    svc = ModelService(tiny_model_path)
    svc.load()
    return svc


@pytest.fixture
def client(tiny_model_path: Path, monkeypatch):
    """TestClient da API com o modelo de brinquedo carregado."""
    from fastapi.testclient import TestClient

    monkeypatch.setenv("APP_MODEL_PATH", str(tiny_model_path))

    # Recria settings e singleton do modelo para pegar o env novo.
    from app import config, dependencies

    config.get_settings.cache_clear()
    dependencies.reset_model()

    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c

    dependencies.reset_model()
    config.get_settings.cache_clear()
