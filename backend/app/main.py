"""Aplicação FastAPI do Classificador de Assuntos Jurídicos da PGE-SP."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import get_settings
from app.dependencies import init_model

DESCRIPTION = """
API de classificação de assuntos jurídicos da PGE-SP.

Pipeline: **OCR/extração → estruturação → predição → explicabilidade**, com
decisão por limiar de corte (abaixo do limiar → *revisar manualmente*).
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Carrega o modelo na inicialização."""
    init_model()
    yield


def create_app() -> FastAPI:
    """Fábrica da aplicação (facilita testes)."""
    settings = get_settings()
    app = FastAPI(
        title="Classificador de Assuntos — PGE-SP",
        description=DESCRIPTION,
        version="0.2.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "X-Filename"],
    )
    app.include_router(router, prefix="/api")
    return app


app = create_app()
