"""Injeção de dependências da aplicação.

Mantém um ``ModelService`` por modelo do catálogo, carregado sob demanda e
reaproveitado entre requisições. Carregar preguiçosamente importa: cada artefato
custa memória e alguns segundos de desserialização, e quem só usa o modelo
padrão não deve pagar pelo outro.
"""

from __future__ import annotations

from app.config import get_settings
from app.services.model import ModelService
from app.services.models import default_model_id, entry_for, model_path

_services: dict[str, ModelService] = {}


def _service_for(model_id: str) -> ModelService:
    """ModelService desse modelo, criando e carregando na primeira chamada."""
    cached = _services.get(model_id)
    if cached is not None:
        return cached

    settings = get_settings()
    entry = entry_for(model_id)
    caminho = model_path(settings, entry) if entry else settings.model_path
    service = ModelService(caminho)
    try:
        service.load()
    except Exception:
        # Mantém o serviço de pé mesmo sem artefato: /health reporta o estado e a
        # rota de predição devolve 503 com a mensagem do ModelService.
        pass
    _services[model_id] = service
    return service


def init_model() -> ModelService:
    """Cria e tenta carregar o modelo padrão. Idempotente."""
    return _service_for(default_model_id(get_settings()))


def get_model() -> ModelService:
    """Dependência FastAPI: retorna o ModelService do modelo padrão."""
    return init_model()


def get_model_by_id(model_id: str | None) -> ModelService:
    """ModelService do modelo pedido, ou o padrão quando ``model_id`` é vazio."""
    if model_id in (None, ""):
        return init_model()
    return _service_for(str(model_id))


def reset_model() -> None:
    """Esvazia o cache de modelos (usado em testes)."""
    _services.clear()


__all__ = ["init_model", "get_model", "get_model_by_id", "reset_model"]
