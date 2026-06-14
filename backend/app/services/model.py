"""Carregamento do modelo e predição de probabilidades.

O artefato (``model.joblib``) é um dict com ``vectorizer`` (TF-IDF), ``clf``
(XGBoost), ``label_names`` e ``metadata``. O ``ModelService`` encapsula o ciclo
de vida: carga preguiçosa, predição e exposição dos metadados.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.services.preprocess import clean_for_model


class ModelNotLoadedError(RuntimeError):
    """Levantado quando o modelo não está disponível."""


@dataclass
class Prediction:
    """Resultado bruto da predição."""

    label: str
    confidence: float
    probabilities: dict[str, float]


class ModelService:
    """Serviço de inferência do classificador."""

    def __init__(self, model_path: str | Path):
        self.model_path = Path(model_path)
        self._vectorizer = None
        self._clf = None
        self._label_names: list[str] = []
        self._metadata: dict = {}

    # ------------------------------------------------------------------ load
    def load(self) -> None:
        """Carrega o artefato do disco."""
        import joblib

        if not self.model_path.exists():
            raise ModelNotLoadedError(
                f"Artefato não encontrado: {self.model_path}. "
                "Treine o modelo ou baixe-o das Releases."
            )
        bundle = joblib.load(self.model_path)
        self._vectorizer = bundle["vectorizer"]
        self._clf = bundle["clf"]
        self._label_names = list(bundle["label_names"])
        self._metadata = bundle.get("metadata", {})

    @property
    def is_loaded(self) -> bool:
        return self._clf is not None

    @property
    def label_names(self) -> list[str]:
        return list(self._label_names)

    @property
    def metadata(self) -> dict:
        return dict(self._metadata)

    # --------------------------------------------------------------- predict
    def _ensure_loaded(self) -> None:
        if not self.is_loaded:
            raise ModelNotLoadedError("Modelo não carregado.")

    def transform(self, text: str):
        """Limpa e vetoriza o texto, retornando a matriz esparsa TF-IDF."""
        self._ensure_loaded()
        cleaned = clean_for_model(text)
        return self._vectorizer.transform([cleaned])

    def predict(self, text: str) -> Prediction:
        """Prediz o assunto e as probabilidades de todos os rótulos."""
        self._ensure_loaded()
        features = self.transform(text)
        proba = self._clf.predict_proba(features)[0]
        idx = int(np.argmax(proba))
        probabilities = {
            self._label_names[i]: float(proba[i]) for i in range(len(self._label_names))
        }
        return Prediction(
            label=self._label_names[idx],
            confidence=float(proba[idx]),
            probabilities=probabilities,
        )

    @property
    def vectorizer(self):
        self._ensure_loaded()
        return self._vectorizer

    @property
    def clf(self):
        self._ensure_loaded()
        return self._clf


__all__ = ["ModelService", "Prediction", "ModelNotLoadedError"]
