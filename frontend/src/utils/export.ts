import type { BatchItem, ExportRow } from '../types';
import { MANUAL_REVIEW_LABEL } from './decision';

/**
 * Converte os itens do lote (com o feedback do usuário) em linhas prontas para
 * a planilha. A decisão "revisar manual" é recalculada com o limiar atual, para
 * refletir o valor do slider no momento da exportação.
 */
export function buildExportRows(
  items: BatchItem[],
  threshold: number,
): ExportRow[] {
  return items.map((item) => {
    const r = item.result;
    if (!r) {
      return {
        document: item.file.name,
        predicted_label: '',
        confidence: 0,
        threshold,
        needs_manual_review: false,
        decision_label: '',
        source: '',
        ocr_used: false,
        char_count: 0,
        model_id: '',
        feedback_status: item.feedback.status,
        correct_label: item.feedback.correctLabel,
        error: item.error ?? 'Falha na classificação.',
      };
    }
    const needsReview = r.confidence < threshold;
    return {
      document: item.file.name,
      predicted_label: r.predicted_label,
      confidence: r.confidence,
      threshold,
      needs_manual_review: needsReview,
      decision_label: needsReview ? MANUAL_REVIEW_LABEL : r.predicted_label,
      source: r.source,
      ocr_used: r.ocr_used,
      char_count: r.char_count,
      model_id: r.model_id,
      feedback_status: item.feedback.status,
      correct_label: item.feedback.correctLabel,
      error: null,
    };
  });
}

/** Dispara o download de um Blob no navegador, criando e revogando a URL. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
