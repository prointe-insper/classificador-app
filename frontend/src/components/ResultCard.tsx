import type { PredictionResponse } from '../types';
import { formatPercent, formatSource } from '../utils/format';

interface ResultCardProps {
  result: PredictionResponse;
  /**
   * Current threshold from the slider. The accept/review decision is recomputed
   * client-side against this value, so moving the slider updates the card
   * instantly without a new backend request.
   */
  threshold: number;
}

export function ResultCard({ result, threshold }: ResultCardProps) {
  const { predicted_label, confidence } = result;

  // Client-side decision: accept when confidence meets or exceeds the threshold.
  const needsReview = confidence < threshold;

  return (
    <section
      className={`decision ${needsReview ? 'decision--review' : 'decision--accept'}`}
      aria-labelledby="decision-class"
      data-testid="result-card"
      data-decision={needsReview ? 'review' : 'accept'}
    >
      <div className="decision__label">Decisão</div>

      {needsReview ? (
        <div className="decision__class" id="decision-class">
          <span aria-hidden="true">⚠</span>
          <span>Revisar manualmente</span>
        </div>
      ) : (
        <div className="decision__class" id="decision-class" title={predicted_label}>
          {predicted_label}
        </div>
      )}

      <div className="decision__row">
        <div className="decision__metric">
          <strong>{formatPercent(confidence)}</strong>
          <span>Confiança</span>
        </div>
        <div className="decision__metric">
          <strong>{formatPercent(threshold, 0)}</strong>
          <span>Limiar atual</span>
        </div>
      </div>

      <p className="decision__note">
        {needsReview ? (
          <>
            A confiança ({formatPercent(confidence)}) está abaixo do limiar
            definido ({formatPercent(threshold, 0)}). Classe prevista pelo modelo:{' '}
            <span className="decision__predicted">{predicted_label}</span>.
          </>
        ) : (
          <>
            Confiança acima do limiar. Classe aceita automaticamente.
          </>
        )}
      </p>

      <div className="meta-line">
        <span className="meta-line__item">
          <strong>{result.char_count.toLocaleString('pt-BR')}</strong> caracteres
          extraídos
        </span>
        <span className="meta-line__item">
          Origem: <span className="tag">{formatSource(result.source)}</span>
        </span>
        <span className="meta-line__item">
          OCR: <strong>{result.ocr_used ? 'sim' : 'não'}</strong>
        </span>
      </div>
    </section>
  );
}
