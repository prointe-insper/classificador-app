import { useState } from 'react';
import type { BatchItem, Feedback, FeedbackStatus } from '../types';
import { formatPercent } from '../utils/format';
import { needsManualReview } from '../utils/decision';
import { ResultCard } from './ResultCard';
import { ProbabilityBars } from './ProbabilityBars';
import { Explanation } from './Explanation';

interface ResultsTableProps {
  items: BatchItem[];
  /** Rótulos da taxonomia, para o dropdown de "rótulo correto". */
  labels: string[];
  threshold: number;
  onFeedbackChange: (id: string, feedback: Feedback) => void;
  onExport: () => void;
  exporting: boolean;
}

export function ResultsTable({
  items,
  labels,
  threshold,
  onFeedbackChange,
  onExport,
  exporting,
}: ResultsTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function setStatus(item: BatchItem, status: FeedbackStatus) {
    // Clicar de novo no mesmo estado desmarca (volta a "não avaliado").
    const nextStatus = item.feedback.status === status ? null : status;
    onFeedbackChange(item.id, {
      status: nextStatus,
      // Limpa o rótulo correto se não estiver mais "incorreto".
      correctLabel: nextStatus === 'incorreto' ? item.feedback.correctLabel : null,
    });
  }

  function setCorrectLabel(item: BatchItem, correctLabel: string) {
    onFeedbackChange(item.id, {
      status: 'incorreto',
      correctLabel: correctLabel || null,
    });
  }

  const done = items.filter((i) => i.status === 'done').length;

  return (
    <section className="card" aria-labelledby="results-title">
      <div className="results__head">
        <h2 className="card__title" id="results-title">
          Resultados ({items.length})
        </h2>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onExport}
          disabled={exporting || done === 0}
          data-testid="export-button"
        >
          {exporting ? (
            <>
              <span className="btn__spinner" aria-hidden="true" /> Gerando…
            </>
          ) : (
            <>⬇ Baixar Excel</>
          )}
        </button>
      </div>

      <div className="results__scroll">
        <table className="results-table" data-testid="results-table">
          <thead>
            <tr>
              <th scope="col">Documento</th>
              <th scope="col">Rótulo predito</th>
              <th scope="col" className="results-table__num">
                Confiança
              </th>
              <th scope="col">Revisar manual</th>
              <th scope="col">Avaliação</th>
              <th scope="col">Rótulo correto</th>
              <th scope="col" aria-label="Detalhes" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const r = item.result;
              const review = r ? needsManualReview(r.confidence, threshold) : false;
              const isExpanded = expanded.has(item.id);
              return (
                <FragmentRow
                  key={item.id}
                  item={item}
                  review={review}
                  isExpanded={isExpanded}
                  labels={labels}
                  threshold={threshold}
                  onToggle={() => toggleExpanded(item.id)}
                  onStatus={(s) => setStatus(item, s)}
                  onCorrectLabel={(l) => setCorrectLabel(item, l)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface FragmentRowProps {
  item: BatchItem;
  review: boolean;
  isExpanded: boolean;
  labels: string[];
  threshold: number;
  onToggle: () => void;
  onStatus: (status: FeedbackStatus) => void;
  onCorrectLabel: (label: string) => void;
}

function FragmentRow({
  item,
  review,
  isExpanded,
  labels,
  threshold,
  onToggle,
  onStatus,
  onCorrectLabel,
}: FragmentRowProps) {
  const r = item.result;
  const canExpand = item.status === 'done' && !!r;

  return (
    <>
      <tr data-testid="results-row" data-status={item.status}>
        <td className="results-table__doc" title={item.file.name}>
          {item.file.name}
        </td>

        {item.status === 'error' ? (
          <td colSpan={2} className="results-table__error">
            ⚠ {item.error ?? 'Falha na classificação.'}
          </td>
        ) : item.status !== 'done' || !r ? (
          <td colSpan={2} className="results-table__pending">
            {item.status === 'running' ? 'Classificando…' : 'Na fila…'}
          </td>
        ) : (
          <>
            <td className="results-table__label" title={r.predicted_label}>
              {r.predicted_label}
            </td>
            <td className="results-table__num">{formatPercent(r.confidence)}</td>
          </>
        )}

        <td>
          {canExpand ? (
            <span
              className={`badge ${review ? 'badge--review' : 'badge--ok'}`}
              data-testid="review-badge"
            >
              {review ? 'Sim' : 'Não'}
            </span>
          ) : (
            <span className="results-table__muted">—</span>
          )}
        </td>

        <td>
          {canExpand ? (
            <div className="feedback">
              <label className="feedback__opt">
                <input
                  type="checkbox"
                  checked={item.feedback.status === 'correto'}
                  onChange={() => onStatus('correto')}
                  aria-label={`Marcar classificação de ${item.file.name} como correta`}
                  data-testid="feedback-correct"
                />
                <span className="feedback__ok">Correta</span>
              </label>
              <label className="feedback__opt">
                <input
                  type="checkbox"
                  checked={item.feedback.status === 'incorreto'}
                  onChange={() => onStatus('incorreto')}
                  aria-label={`Marcar classificação de ${item.file.name} como incorreta`}
                  data-testid="feedback-incorrect"
                />
                <span className="feedback__bad">Incorreta</span>
              </label>
            </div>
          ) : (
            <span className="results-table__muted">—</span>
          )}
        </td>

        <td>
          {canExpand && item.feedback.status === 'incorreto' ? (
            <select
              className="feedback__select"
              value={item.feedback.correctLabel ?? ''}
              onChange={(e) => onCorrectLabel(e.target.value)}
              aria-label={`Rótulo correto para ${item.file.name}`}
              data-testid="feedback-correct-label"
            >
              <option value="">Selecione o rótulo correto…</option>
              {labels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <span className="results-table__muted">—</span>
          )}
        </td>

        <td className="results-table__actions">
          {canExpand ? (
            <button
              type="button"
              className="btn btn--link"
              aria-expanded={isExpanded}
              onClick={onToggle}
              data-testid="toggle-details"
            >
              {isExpanded ? 'Ocultar' : 'Detalhes'}
            </button>
          ) : null}
        </td>
      </tr>

      {canExpand && isExpanded && r ? (
        <tr className="results-table__detail-row" data-testid="results-detail">
          <td colSpan={7}>
            <div className="results-detail">
              <ResultCard result={r} threshold={threshold} />
              <ProbabilityBars probabilities={r.probabilities} />
              <Explanation explanation={r.explanation} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
