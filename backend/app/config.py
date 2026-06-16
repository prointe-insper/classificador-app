"""Configuração da aplicação via variáveis de ambiente (pydantic-settings)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Configurações da API.

    Valores podem ser sobrescritos por variáveis de ambiente prefixadas com
    ``APP_`` (ex.: ``APP_MODEL_PATH``).
    """

    model_config = SettingsConfigDict(env_prefix="APP_", env_file=".env", extra="ignore")

    model_path: Path = Field(
        default=BACKEND_ROOT / "model" / "artifacts" / "model.joblib",
        description="Caminho para o artefato do modelo (.joblib).",
    )
    model_id: str = Field(
        default="pge-tfidf-xgboost-v1",
        description="Identificador do modelo ativo (preparado para múltiplos modelos).",
    )
    model_name: str = Field(
        default="PGE · TF-IDF + XGBoost (v1)",
        description="Nome amigável do modelo ativo exibido no seletor.",
    )
    default_threshold: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Limiar padrão de confiança para decidir 'revisar manualmente'.",
    )
    max_upload_mb: int = Field(default=25, description="Tamanho máximo de upload em MB.")
    ocr_enabled: bool = Field(
        default=True,
        description="Habilita OCR de PDFs escaneados/imagens (requer tesseract+poppler).",
    )
    ocr_language: str = Field(default="por", description="Idioma do tesseract.")
    explain_top_k: int = Field(default=12, description="Nº de termos retornados na explicação.")
    cors_origins: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
        description="Origens permitidas para CORS.",
    )


@lru_cache
def get_settings() -> Settings:
    """Retorna as configurações (cacheadas)."""
    return Settings()
