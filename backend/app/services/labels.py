"""Parsing dos rótulos da coluna ``PGE_ASSUNTOS_REVISADA``.

A coluna guarda uma lista JSON de rótulos (ex.: ``["ICMS Declarado"]``). Algumas
linhas têm aspas internas mal escapadas, então fazemos um parse tolerante,
inspirado em ``classificador_assuntos.utils.assuntos``.
"""

from __future__ import annotations

import json
import re


def parse_labels(raw: object) -> list[str]:
    """Faz parse de uma célula bruta em uma lista de rótulos."""
    if raw is None:
        return []
    if isinstance(raw, float):  # NaN
        return []
    s = str(raw).strip()
    if not s:
        return []
    try:
        loaded = json.loads(s)
    except json.JSONDecodeError:
        loaded = _tolerant_parse(s)
    if not isinstance(loaded, list):
        return []
    return [str(x) for x in loaded if x is not None and str(x).strip()]


def parse_first_label(raw: object) -> str | None:
    """Retorna o primeiro rótulo da célula, ou ``None`` se vazia."""
    labels = parse_labels(raw)
    return labels[0] if labels else None


def _tolerant_parse(s: str) -> list[str]:
    m = re.match(r"^\[(.*)\]$", s, flags=re.DOTALL)
    if not m:
        return []
    inner = m.group(1).strip()
    if not inner:
        return []
    items = re.split(r'",\s*"', inner)
    cleaned: list[str] = []
    for it in items:
        t = it.strip().strip('"').replace('"', "")
        if t.strip():
            cleaned.append(t)
    return cleaned


__all__ = ["parse_labels", "parse_first_label"]
