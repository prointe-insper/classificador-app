"""Schemas Pydantic da API (contratos de request/response)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LabelProbability(BaseModel):
    """Probabilidade associada a um rótulo."""

    label: str = Field(..., description="Nome do rótulo da taxonomia.")
    probability: float = Field(..., ge=0.0, le=1.0, description="Probabilidade prevista.")


class ExplanationToken(BaseModel):
    """Contribuição de um termo para a classe prevista."""

    token: str = Field(..., description="Termo (uni/bi-grama) do documento.")
    weight: float = Field(..., description="Contribuição (SHAP) para a classe prevista.")


class PredictionResponse(BaseModel):
    """Resposta da predição de assunto."""

    predicted_label: str = Field(..., description="Classe escolhida pelo modelo.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Probabilidade da classe escolhida.")
    threshold: float = Field(..., ge=0.0, le=1.0, description="Limiar de corte aplicado.")
    needs_manual_review: bool = Field(
        ..., description="True quando a confiança fica abaixo do limiar."
    )
    decision_label: str = Field(
        ...,
        description="Rótulo final exibido: a classe ou 'Revisar manualmente'.",
    )
    probabilities: list[LabelProbability] = Field(
        ..., description="Probabilidades de todos os rótulos (ordenadas, desc)."
    )
    explanation: list[ExplanationToken] = Field(
        default_factory=list,
        description="Termos mais influentes para a decisão (explicabilidade).",
    )
    char_count: int = Field(..., description="Nº de caracteres do texto extraído.")
    ocr_used: bool = Field(..., description="Indica se OCR foi necessário na extração.")
    source: str = Field(..., description="Origem do texto: 'text', 'pdf', 'pdf+ocr' ou 'image'.")


class LabelsResponse(BaseModel):
    """Lista de rótulos suportados pelo modelo."""

    labels: list[str]


class ModelInfoResponse(BaseModel):
    """Metadados do modelo carregado."""

    model_type: str
    target_column: str
    n_documents: int
    n_features: int
    label_names: list[str]
    class_distribution: dict[str, int]


class HealthResponse(BaseModel):
    """Status de saúde do serviço."""

    status: str
    model_loaded: bool


class ErrorResponse(BaseModel):
    """Resposta de erro padronizada."""

    detail: str
