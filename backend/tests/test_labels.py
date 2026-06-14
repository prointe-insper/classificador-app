"""Testes do parser de rótulos."""

from app.services.labels import parse_first_label, parse_labels


def test_parse_labels_valid_json():
    assert parse_labels('["ICMS Declarado"]') == ["ICMS Declarado"]
    assert parse_labels('["A", "B"]') == ["A", "B"]


def test_parse_labels_empty_and_nan():
    assert parse_labels(None) == []
    assert parse_labels("") == []
    assert parse_labels(float("nan")) == []


def test_parse_labels_tolerant_internal_quotes():
    # Aspas internas não escapadas não devem quebrar o parse.
    raw = '["Saúde - "Medicamentos" oncológicos"]'
    out = parse_labels(raw)
    assert len(out) == 1
    assert "Medicamentos" in out[0]


def test_parse_first_label():
    assert parse_first_label('["ICMS Declarado", "Outro"]') == "ICMS Declarado"
    assert parse_first_label("[]") is None
    assert parse_first_label(None) is None
