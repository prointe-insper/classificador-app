"""Catálogo de modelos disponíveis.

Hoje há um único modelo (TF-IDF + XGBoost treinado nos dados da PGE-SP), mas a
API já expõe uma *lista* para que o frontend ofereça um seletor preparado para
múltiplos modelos no futuro (ex.: variações de taxonomia ou de algoritmo).
"""

from __future__ import annotations

from app.config import Settings
from app.schemas import ModelOption


def available_models(settings: Settings) -> list[ModelOption]:
    """Retorna os modelos que o serviço sabe servir."""
    return [
        ModelOption(
            id=settings.model_id,
            name=settings.model_name,
            description=(
                "Classificador de assuntos (TF-IDF 1-2 gramas + XGBoost) treinado "
                "na base rotulada da PGE-SP, com a taxonomia revisada."
            ),
            is_default=True,
        ),
    ]


def is_valid_model_id(settings: Settings, model_id: str) -> bool:
    """Indica se ``model_id`` corresponde a um modelo disponível."""
    return any(m.id == model_id for m in available_models(settings))


__all__ = ["available_models", "is_valid_model_id"]
