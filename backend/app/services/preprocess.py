"""Pré-processamento e estruturação do texto das petições.

Este módulo é compartilhado entre o **treino** e a **inferência**, garantindo que
o texto visto pelo modelo em produção seja tratado exatamente como no ajuste.

O pipeline de estruturação:

1. ``normalize_text``: normaliza unicode, remove marcadores de página inseridos
   pelo OCR (ex.: ``# PAGINA 001 de 003 ---``), padroniza espaços em branco.
2. ``clean_for_model``: aplica ``normalize_text`` e coloca em caixa baixa — é a
   forma final consumida pelo ``TfidfVectorizer``.

Mantemos números (inclusive números de processo) porque vários rótulos da
taxonomia da PGE referenciam ações coletivas específicas pelo número CNJ.
"""

from __future__ import annotations

import re
import unicodedata

# Marcador de página produzido pela extração via poppler/OCR.
_PAGE_MARKER = re.compile(r"#\s*PAGINA\s*\d+\s*de\s*\d+\s*-*", re.IGNORECASE)
# Sequências de hífens/underscores usadas como separadores visuais.
_RULE_LINE = re.compile(r"[_\-]{4,}")
_MULTISPACE = re.compile(r"[ \t ]+")
_MULTINEWLINE = re.compile(r"\n{3,}")


def normalize_text(text: str | None) -> str:
    """Normaliza o texto bruto preservando a semântica jurídica.

    - Converte para unicode NFC e troca NBSP por espaço comum.
    - Remove marcadores de página e linhas-régua de OCR.
    - Colapsa espaços e quebras de linha excessivas.
    """
    if not text:
        return ""
    s = unicodedata.normalize("NFC", str(text))
    s = s.replace(" ", " ").replace("​", "")
    s = _PAGE_MARKER.sub(" ", s)
    s = _RULE_LINE.sub(" ", s)
    s = _MULTISPACE.sub(" ", s)
    s = _MULTINEWLINE.sub("\n\n", s)
    # remove espaços nas bordas de cada linha
    s = "\n".join(line.strip() for line in s.split("\n"))
    return s.strip()


def clean_for_model(text: str | None) -> str:
    """Forma canônica consumida pelo vetorizador TF-IDF (texto normalizado, minúsculo)."""
    return normalize_text(text).lower()


__all__ = ["normalize_text", "clean_for_model"]
