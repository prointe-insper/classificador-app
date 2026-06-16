import { formatPercent } from '../utils/format';

interface ProgressBarProps {
  done: number;
  total: number;
  /** Nome do documento sendo processado no momento (opcional). */
  current?: string | null;
}

/** Barra de progresso da classificação em lote (N de M documentos). */
export function ProgressBar({ done, total, current }: ProgressBarProps) {
  const ratio = total > 0 ? done / total : 0;
  return (
    <section className="card" aria-label="Progresso da classificação">
      <div className="progress__head">
        <strong>Classificando…</strong>
        <span data-testid="progress-count">
          {done} de {total}
        </span>
      </div>
      <div className="progress__track">
        <div
          className="progress__fill"
          style={{ width: `${ratio * 100}%` }}
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuetext={`${formatPercent(ratio, 0)}`}
        />
      </div>
      {current ? (
        <p className="progress__current" title={current}>
          {current}
        </p>
      ) : null}
    </section>
  );
}
