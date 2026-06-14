"""Testes da extração de texto (OCR/parse)."""

import pytest

from app.services.ocr import ExtractionError, extract_text


def test_extract_txt_utf8():
    res = extract_text("Petição inicial — ação".encode("utf-8"), "doc.txt")
    assert res.source == "text"
    assert res.ocr_used is False
    assert "Petição" in res.text


def test_extract_txt_latin1_fallback():
    res = extract_text("ação".encode("latin-1"), "doc.txt")
    assert "a" in res.text.lower()
    assert res.source == "text"


def test_unsupported_format_raises():
    with pytest.raises(ExtractionError):
        extract_text(b"data", "planilha.xlsx")


def test_image_with_ocr_disabled_raises():
    with pytest.raises(ExtractionError):
        extract_text(b"\x89PNG", "scan.png", ocr_enabled=False)


def test_invalid_image_raises():
    # Bytes que não são imagem válida → erro amigável (se OCR habilitado/instalado).
    with pytest.raises(ExtractionError):
        extract_text(b"not-an-image", "scan.png", ocr_enabled=True)
