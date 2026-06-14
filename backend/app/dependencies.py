"""Injeção de dependências da aplicação.

Mantém uma instância única (singleton) do ``ModelService`` carregada na inicialização
da app e injetada nas rotas via ``Depends(get_model)``.
"""

from __future__ import annotations

from app.config import get_settings
from app.services.model import ModelService

_model_service: ModelService | None = None


def init_model() -> ModelService:
    """Cria e tenta carregar o modelo. Idempotente."""
    global _model_service
    if _model_service is None:
        settings = get_settings()
        _model_service = ModelService(settings.model_path)
        try:
            _model_service.load()
        except Exception:
            # Mantém o serviço de pé mesmo sem artefato; /health reporta o estado.
            pass
    return _model_service


def get_model() -> ModelService:
    """Dependência FastAPI: retorna o ModelService singleton."""
    return init_model()


def reset_model() -> None:
    """Reseta o singleton (usado em testes)."""
    global _model_service
    _model_service = None


__all__ = ["init_model", "get_model", "reset_model"]
