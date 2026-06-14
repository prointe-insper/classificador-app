"""Testes do pré-processamento/estruturação de texto."""

from app.services.preprocess import clean_for_model, normalize_text


def test_normalize_text_empty_inputs():
    assert normalize_text(None) == ""
    assert normalize_text("") == ""
    assert normalize_text("   ") == ""


def test_normalize_text_removes_page_markers():
    raw = "# PAGINA 001 de 003 -----------\nTexto da petição\n# PAGINA 002 de 003 ----"
    out = normalize_text(raw)
    assert "PAGINA" not in out
    assert "Texto da petição" in out


def test_normalize_text_collapses_whitespace_and_nbsp():
    raw = "A  petição    inicial\n\n\n\nfinal"
    out = normalize_text(raw)
    assert " " not in out
    assert "  " not in out  # nenhum espaço duplo inline
    assert "petição inicial" in out
    # Quebras de linha múltiplas viram no máximo uma linha em branco (parágrafo).
    assert "\n\n\n" not in out


def test_normalize_text_strips_rule_lines():
    raw = "Cabeçalho\n__________________________\nCorpo"
    out = normalize_text(raw)
    assert "____" not in out


def test_clean_for_model_lowercases():
    assert clean_for_model("ICMS Declarado") == "icms declarado"


def test_clean_for_model_preserves_numbers():
    # Números de processo são informativos para a taxonomia.
    out = clean_for_model("Ação coletiva 1001391-23.2014.8.26.0053")
    assert "1001391-23.2014.8.26.0053" in out
