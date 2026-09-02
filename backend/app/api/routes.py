"""Rotas da API REST."""

from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)

from app.config import Settings, get_settings
from app.dependencies import get_model, get_model_by_id
from app.schemas import (
    ExportRequest,
    HealthResponse,
    LabelsResponse,
    ModelInfoResponse,
    ModelsResponse,
    PredictionResponse,
)
from app.services.export import build_xlsx, export_filename
from app.services.model import ModelNotLoadedError, ModelService
from app.services.models import available_models, default_model_id, is_valid_model_id
from app.services.ocr import ExtractionError
from app.services.pipeline import run_pipeline

router = APIRouter()

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/health", response_model=HealthResponse, tags=["infra"])
def health(model: ModelService = Depends(get_model)) -> HealthResponse:
    """Verifica a saúde do serviço e se o modelo está carregado."""
    return HealthResponse(status="ok", model_loaded=model.is_loaded)


@router.get("/labels", response_model=LabelsResponse, tags=["modelo"])
def labels(
    model_id: str | None = Query(default=None, description="Modelo a consultar."),
    settings: Settings = Depends(get_settings),
) -> LabelsResponse:
    """Lista os rótulos suportados pelo modelo escolhido.

    Os rótulos são por modelo, não da aplicação: a v1 tem 12 e a v2 tem 16, sem
    interseção. A tela de revisão precisa dos rótulos do modelo que classificou.
    """
    model = _model_for(settings, model_id)
    _require_model(model)
    return LabelsResponse(labels=model.label_names)


@router.get("/models", response_model=ModelsResponse, tags=["modelo"])
def models(settings: Settings = Depends(get_settings)) -> ModelsResponse:
    """Lista os modelos disponíveis para seleção."""
    return ModelsResponse(
        models=available_models(settings),
        default_id=default_model_id(settings),
    )


@router.get("/model-info", response_model=ModelInfoResponse, tags=["modelo"])
def model_info(
    model_id: str | None = Query(default=None, description="Modelo a consultar."),
    settings: Settings = Depends(get_settings),
) -> ModelInfoResponse:
    """Retorna metadados do modelo escolhido."""
    model = _model_for(settings, model_id)
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
    model_id: str | None = Form(
        default=None, description="Id do modelo a usar. Usa o padrão se omitido."
    ),
    settings: Settings = Depends(get_settings),
) -> PredictionResponse:
    """Classifica o documento enviado e retorna classe, probabilidades e explicação."""
    used_threshold = settings.default_threshold if threshold is None else threshold
    if not 0.0 <= used_threshold <= 1.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O limiar deve estar entre 0 e 1.",
        )

    used_model_id = default_model_id(settings) if model_id in (None, "") else model_id
    model = _model_for(settings, used_model_id)
    _require_model(model)

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
            model_id=used_model_id,
        )
    except ExtractionError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.post("/export-xlsx", tags=["modelo"])
def export_xlsx(payload: ExportRequest) -> Response:
    """Gera uma planilha XLSX com as classificações e o feedback informado."""
    if not payload.rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nada para exportar: a tabela está vazia.",
        )
    data = build_xlsx(payload.rows)
    filename = export_filename()
    return Response(
        content=data,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Filename": filename,
        },
    )


def _model_for(settings: Settings, model_id: str | None) -> ModelService:
    """Serviço do modelo pedido, ou o padrão quando o id vem vazio.

    Id desconhecido é 422 e não 404: do ponto de vista da API, o cliente mandou
    um valor inválido num campo, e a mensagem lista o que existe para facilitar a
    correção.
    """
    if model_id in (None, ""):
        return get_model_by_id(None)
    if not is_valid_model_id(settings, str(model_id)):
        disponiveis = ", ".join(m.id for m in available_models(settings))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Modelo desconhecido: '{model_id}'. Disponíveis: {disponiveis}.",
        )
    return get_model_by_id(str(model_id))


def _require_model(model: ModelService) -> None:
    if not model.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Modelo não carregado. Treine o modelo ou baixe-o das Releases.",
        )


__all__ = ["router"]
