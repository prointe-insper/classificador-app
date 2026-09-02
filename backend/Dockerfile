# Backend FastAPI — Classificador de Assuntos PGE-SP
FROM python:3.12-slim

# Dependências de sistema para OCR (tesseract + idioma português) e PDFs (poppler).
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-por \
        poppler-utils \
        curl \
    && rm -rf /var/lib/apt/lists/*

# uv (gerenciador de pacotes/venv).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Instala dependências primeiro (cache de camadas).
COPY pyproject.toml README.md ./
COPY app ./app
RUN uv sync --no-dev

# Código e artefatos do modelo.
COPY model ./model

ENV PATH="/app/.venv/bin:$PATH" \
    APP_MODEL_PATH=/app/model/artifacts/model.joblib \
    APP_LEGACY_MODEL_PATH=/app/model/artifacts_xgb_v1/model.joblib \
    PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fs http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
