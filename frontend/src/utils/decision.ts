/** Rótulo exibido quando a confiança fica abaixo do limiar de corte. */
export const MANUAL_REVIEW_LABEL = 'Revisar manualmente';

/** Decisão client-side: precisa de revisão quando a confiança < limiar. */
export function needsManualReview(confidence: number, threshold: number): boolean {
  return confidence < threshold;
}
