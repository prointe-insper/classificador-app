"""Rotas da API REST."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.config import Settings, get_settings
from app.dependencies import get_model
from app.schemas import (
    HealthResponse,
    LabelsResponse,
    ModelInfoResponse,
    PredictionResponse,
)
from app.services.model import ModelNotLoadedError, ModelService
from app.services.ocr import ExtractionError
from app.services.pipeline import run_pipeline

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["infra"])
def health(model: ModelService = Depends(get_model)) -> HealthResponse:
    """Verifica a saúde do serviço e se o modelo está carregado."""
    return HealthResponse(status="ok", model_loaded=model.is_loaded)


@router.get("/labels", response_model=LabelsResponse, tags=["modelo"])
def labels(model: ModelService = Depends(get_model)) -> LabelsResponse:
    """Lista os rótulos suportados pelo modelo."""
    _require_model(model)
    return LabelsResponse(labels=model.label_names)


@router.get("/model-info", response_model=ModelInfoResponse, tags=["modelo"])
def model_info(model: ModelService = Depends(get_model)) -> ModelInfoResponse:
    """Retorna metadados do modelo carregado."""
    _require_model(model)
    meta = model.metadata
    return ModelInfoResponse(
        model_type=meta.get("model_type", "desconhecido"),
        target_column=meta.get("target_column", ""),
        n_documents=meta.get("n_documents", 0),
        n_features=meta.get("n_features", 0),
        label_names=model.label_names,
        class_distribution=meta.get("class_distribution", {}),
    )


@router.post("/predict", response_model=PredictionResponse, tags=["modelo"])
async def predict(
    file: UploadFile = File(..., description="Arquivo TXT, PDF ou imagem."),
    threshold: float | None = Form(
        default=None, description="Limiar de corte (0-1). Usa o padrão se omitido."
    ),
    model: ModelService = Depends(get_model),
    settings: Settings = Depends(get_settings),
) -> PredictionResponse:
    """Classifica o documento enviado e retorna classe, probabilidades e explicação."""
    _require_model(model)

    used_threshold = settings.default_threshold if threshold is None else threshold
    if not 0.0 <= used_threshold <= 1.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O limiar deve estar entre 0 e 1.",
        )

    content = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Arquivo excede o limite de {settings.max_upload_mb} MB.",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio."
        )

    try:
        return run_pipeline(
            model,
            content,
            file.filename or "documento",
            threshold=used_threshold,
            ocr_enabled=settings.ocr_enabled,
            ocr_language=settings.ocr_language,
            explain_top_k=settings.explain_top_k,
        )
    except ExtractionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


def _require_model(model: ModelService) -> None:
    if not model.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Modelo não carregado. Treine o modelo ou baixe-o das Releases.",
        )


__all__ = ["router"]
