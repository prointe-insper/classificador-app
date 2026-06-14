"""Orquestração do pipeline de classificação.

Encadeia as etapas exigidas pela issue:

    OCR/extração  →  estruturação (preprocess)  →  predição  →  explicabilidade

e aplica a regra de decisão por **limiar de corte** (abaixo do limiar →
"Revisar manualmente").
"""

from __future__ import annotations

from app.schemas import ExplanationToken, LabelProbability, PredictionResponse
from app.services.explain import explain
from app.services.model import ModelService
from app.services.ocr import extract_text

MANUAL_REVIEW_LABEL = "Revisar manualmente"


def run_pipeline(
    model: ModelService,
    content: bytes,
    filename: str,
    *,
    threshold: float,
    ocr_enabled: bool = True,
    ocr_language: str = "por",
    explain_top_k: int = 12,
) -> PredictionResponse:
    """Executa o pipeline completo sobre o arquivo enviado."""
    extraction = extract_text(
        content, filename, ocr_enabled=ocr_enabled, ocr_language=ocr_language
    )
    text = extraction.text
    if not text.strip():
        raise ValueError("Não foi possível extrair texto do arquivo enviado.")

    prediction = model.predict(text)
    needs_review = prediction.confidence < threshold
    decision = MANUAL_REVIEW_LABEL if needs_review else prediction.label

    contributions = explain(model, text, prediction.label, top_k=explain_top_k)

    probabilities = [
        LabelProbability(label=lbl, probability=prob)
        for lbl, prob in sorted(
            prediction.probabilities.items(), key=lambda kv: kv[1], reverse=True
        )
    ]
    explanation = [
        ExplanationToken(token=c.token, weight=c.weight) for c in contributions
    ]

    return PredictionResponse(
        predicted_label=prediction.label,
        confidence=prediction.confidence,
        threshold=threshold,
        needs_manual_review=needs_review,
        decision_label=decision,
        probabilities=probabilities,
        explanation=explanation,
        char_count=len(text),
        ocr_used=extraction.ocr_used,
        source=extraction.source,
    )


__all__ = ["run_pipeline", "MANUAL_REVIEW_LABEL"]
