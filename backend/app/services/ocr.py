"""Extração de texto da entrada: TXT, PDF (nativo ou OCR) e imagens.

Estratégia para PDFs: primeiro tenta extrair o texto embutido (rápido, sem
perdas). Se o PDF for escaneado (pouco ou nenhum texto), cai para OCR via
``pdf2image`` + ``pytesseract``. Imagens vão direto para OCR.

O OCR é *opcional*: se o tesseract/poppler não estiverem instalados, a extração
de PDFs nativos continua funcionando e imagens retornam erro amigável.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

# Limite mínimo de caracteres por página para considerar que o PDF tem texto nativo.
_MIN_CHARS_PER_PAGE = 40


@dataclass
class ExtractionResult:
    """Resultado da extração de texto."""

    text: str
    source: str  # 'text' | 'pdf' | 'pdf+ocr' | 'image'
    ocr_used: bool


class ExtractionError(ValueError):
    """Erro de extração de texto (entrada inválida ou OCR indisponível)."""


def extract_text(
    content: bytes,
    filename: str,
    *,
    ocr_enabled: bool = True,
    ocr_language: str = "por",
) -> ExtractionResult:
    """Extrai texto de ``content`` de acordo com a extensão de ``filename``."""
    name = (filename or "").lower()
    if name.endswith(".txt") or name.endswith(".md"):
        return ExtractionResult(_decode_text(content), "text", False)
    if name.endswith(".pdf"):
        return _extract_pdf(content, ocr_enabled=ocr_enabled, ocr_language=ocr_language)
    if name.endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp")):
        return _extract_image(content, ocr_enabled=ocr_enabled, ocr_language=ocr_language)
    raise ExtractionError(
        f"Formato não suportado: '{filename}'. Use TXT, PDF ou imagem."
    )


def _decode_text(content: bytes) -> str:
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _extract_pdf(content: bytes, *, ocr_enabled: bool, ocr_language: str) -> ExtractionResult:
    text = _pdf_native_text(content)
    pages = max(text.count("\f") + 1, 1)
    if len(text.strip()) >= _MIN_CHARS_PER_PAGE * pages or not ocr_enabled:
        if text.strip():
            return ExtractionResult(text, "pdf", False)
    if not ocr_enabled:
        raise ExtractionError(
            "PDF sem texto nativo e OCR desabilitado. Habilite o OCR (APP_OCR_ENABLED=true)."
        )
    ocr_text = _pdf_ocr(content, ocr_language)
    return ExtractionResult(ocr_text, "pdf+ocr", True)


def _pdf_native_text(content: bytes) -> str:
    """Extrai o texto embutido do PDF (sem OCR)."""
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\f".join(parts)


def _pdf_ocr(content: bytes, language: str) -> str:
    """Rasteriza o PDF e aplica OCR página a página."""
    try:
        import pytesseract
        from pdf2image import convert_from_bytes
    except ImportError as exc:  # pragma: no cover - dependência opcional
        raise ExtractionError("Dependências de OCR não instaladas.") from exc

    try:
        images = convert_from_bytes(content, dpi=200)
    except Exception as exc:  # poppler ausente
        raise ExtractionError(
            "Não foi possível rasterizar o PDF (poppler ausente?)."
        ) from exc
    parts = [pytesseract.image_to_string(img, lang=language) for img in images]
    return "\f".join(parts)


def _extract_image(content: bytes, *, ocr_enabled: bool, ocr_language: str) -> ExtractionResult:
    if not ocr_enabled:
        raise ExtractionError("Entrada é imagem mas o OCR está desabilitado.")
    try:
        import pytesseract
        from PIL import Image
    except ImportError as exc:  # pragma: no cover
        raise ExtractionError("Dependências de OCR não instaladas.") from exc
    try:
        img = Image.open(io.BytesIO(content))
    except Exception as exc:
        raise ExtractionError("Arquivo de imagem inválido.") from exc
    text = pytesseract.image_to_string(img, lang=ocr_language)
    return ExtractionResult(text, "image", True)


__all__ = ["extract_text", "ExtractionResult", "ExtractionError"]
