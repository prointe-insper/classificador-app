import type { ProbabilityItem } from '../types';
import { formatPercent } from '../utils/format';

interface ProbabilityBarsProps {
  probabilities: ProbabilityItem[];
}

export function ProbabilityBars({ probabilities }: ProbabilityBarsProps) {
  // Defensive: ensure descending order regardless of input.
  const sorted = [...probabilities].sort(
    (a, b) => b.probability - a.probability,
  );
  const max = sorted.length > 0 ? sorted[0].probability : 0;

  return (
    <section className="card" aria-labelledby="probs-title">
      <h2 className="card__title" id="probs-title">
        Probabilidades por classe
      </h2>
      <ul className="bars" aria-label="Probabilidades por classe">
        {sorted.map((item, index) => {
          const isTop = index === 0;
          // Bar width is proportional to the top probability for visual contrast.
          const width = max > 0 ? (item.probability / max) * 100 : 0;
          return (
            <li
              key={item.label}
              className={`bar${isTop ? ' bar--top' : ''}`}
              data-testid="prob-bar"
            >
              <span className="bar__label" title={item.label}>
                {item.label}
              </span>
              <span className="bar__pct">{formatPercent(item.probability)}</span>
              <span className="bar__track">
                <span
                  className="bar__fill"
                  style={{ width: `${width}%` }}
                  role="progressbar"
                  aria-label={item.label}
                  aria-valuenow={Math.round(item.probability * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
