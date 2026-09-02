"""Carregamento do modelo e predição de probabilidades.

O artefato (``model.joblib``) é um dict com ``vectorizer`` (TF-IDF), ``clf``
(o estimador), ``label_names`` e ``metadata``. O ``ModelService`` encapsula o
ciclo de vida: carga preguiçosa, predição e exposição dos metadados.

O ``metadata`` também descreve **como** vetorizar, para que o serviço reproduza
o pipeline com que o modelo foi treinado:

- ``preprocess``: ``"clean"`` (normaliza e minúscula, via ``clean_for_model``)
  ou ``"raw"`` (entrega o texto cru ao vetorizador, que já faz o lowercase).
- ``chunking``: ausente para vetorizar o documento inteiro de uma vez; presente
  para quebrar em janelas de tamanho fixo, vetorizar cada uma e usar a **média**
  dos vetores como representação do documento (estratégia do ``juriclass``).

Sem essas chaves o comportamento é o histórico (``clean`` + documento inteiro),
então bundles antigos continuam carregando sem alteração.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.services.preprocess import clean_for_model

DEFAULT_CHUNK_WORDS = 100
DEFAULT_CHUNK_OVERLAP = 50


class ModelNotLoadedError(RuntimeError):
    """Levantado quando o modelo não está disponível."""


def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_WORDS,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[str]:
    """Quebra o texto em janelas de palavras com sobreposição.

    Porta de ``FixedChunker.split`` (``juriclass/src/juriclass/chunking/fixed.py``).
    Precisa continuar idêntica ao original: o vocabulário do TF-IDF foi ajustado
    sobre chunks produzidos por ela.
    """
    words = text.split()
    if not words:
        return [""]
    step = chunk_size - overlap
    chunks: list[str] = []
    for start in range(0, max(1, len(words) - overlap), step):
        chunk = words[start : start + chunk_size]
        if chunk:
            chunks.append(" ".join(chunk))
    return chunks or [""]


def to_dense(features) -> np.ndarray:
    """Converte a matriz de features para ``ndarray`` denso, esparsa ou não."""
    if hasattr(features, "toarray"):
        return features.toarray()
    return np.asarray(features)


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

    @property
    def chunking(self) -> dict | None:
        """Configuração de chunking do bundle, ou ``None`` para documento inteiro."""
        cfg = self._metadata.get("chunking")
        return dict(cfg) if isinstance(cfg, dict) else None

    @property
    def explanation_method(self) -> str:
        """Método de explicabilidade compatível com o estimador do bundle."""
        return str(self._metadata.get("explanation", "shap"))

    # --------------------------------------------------------------- predict
    def _ensure_loaded(self) -> None:
        if not self.is_loaded:
            raise ModelNotLoadedError("Modelo não carregado.")

    def _prepare(self, text: str) -> str:
        """Aplica (ou não) a limpeza, conforme o modo gravado no bundle."""
        if self._metadata.get("preprocess") == "raw":
            return text
        return clean_for_model(text)

    def transform(self, text: str):
        """Vetoriza o texto na representação esperada pelo estimador.

        Retorna sempre uma matriz ``(1, n_features)``: esparsa no caminho de
        documento inteiro, densa no caminho de chunks (a média dos vetores dos
        chunks é densa de qualquer forma).
        """
        self._ensure_loaded()
        prepared = self._prepare(text)
        cfg = self.chunking
        if not cfg:
            return self._vectorizer.transform([prepared])
        chunks = chunk_text(
            prepared,
            int(cfg.get("chunk_words", DEFAULT_CHUNK_WORDS)),
            int(cfg.get("overlap", DEFAULT_CHUNK_OVERLAP)),
        )
        vectors = self._vectorizer.transform(chunks).toarray()
        return vectors.mean(axis=0).reshape(1, -1)

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


__all__ = [
    "ModelService",
    "Prediction",
    "ModelNotLoadedError",
    "chunk_text",
    "to_dense",
]
