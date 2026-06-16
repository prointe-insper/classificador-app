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
    model_id: str = Field(default="", description="Identificador do modelo que gerou a predição.")


class ModelOption(BaseModel):
    """Um modelo disponível para seleção no frontend."""

    id: str = Field(..., description="Identificador estável do modelo.")
    name: str = Field(..., description="Nome amigável exibido no seletor.")
    description: str = Field(default="", description="Descrição curta do modelo.")
    is_default: bool = Field(default=False, description="True para o modelo padrão.")


class ModelsResponse(BaseModel):
    """Lista de modelos disponíveis (preparada para múltiplos modelos)."""

    models: list[ModelOption]
    default_id: str = Field(..., description="Id do modelo selecionado por padrão.")


class ExportRow(BaseModel):
    """Uma linha da tabela de classificações a exportar (com feedback opcional)."""

    document: str = Field(..., description="Nome do arquivo classificado.")
    predicted_label: str = Field(default="", description="Rótulo previsto pelo modelo.")
    confidence: float = Field(default=0.0, description="Confiança da classe prevista (0-1).")
    threshold: float = Field(default=0.0, description="Limiar de corte aplicado (0-1).")
    needs_manual_review: bool = Field(
        default=False, description="True quando a confiança ficou abaixo do limiar."
    )
    decision_label: str = Field(default="", description="Decisão final exibida.")
    source: str = Field(default="", description="Origem do texto extraído.")
    ocr_used: bool = Field(default=False, description="Se OCR foi usado.")
    char_count: int = Field(default=0, description="Nº de caracteres extraídos.")
    model_id: str = Field(default="", description="Modelo usado na predição.")
    feedback_status: str | None = Field(
        default=None, description="Avaliação humana: 'correto', 'incorreto' ou None."
    )
    correct_label: str | None = Field(
        default=None, description="Rótulo correto informado quando a predição está errada."
    )
    error: str | None = Field(default=None, description="Mensagem de erro, se a predição falhou.")


class ExportRequest(BaseModel):
    """Payload para exportar a planilha de classificações."""

    rows: list[ExportRow] = Field(..., description="Linhas da tabela.")
    model_id: str | None = Field(default=None, description="Modelo de referência da exportação.")


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
