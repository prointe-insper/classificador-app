import { useId } from 'react';
import { formatPercent } from '../utils/format';

interface ThresholdControlProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function ThresholdControl({
  value,
  onChange,
  disabled = false,
}: ThresholdControlProps) {
  const id = useId();

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="threshold__head">
        <label className="card__title" id={`${id}-title`} htmlFor={id} style={{ marginBottom: 0 }}>
          Limiar de confiança (corte para revisão manual)
        </label>
        <span className="threshold__value" aria-hidden="true">
          {formatPercent(value, 0)}
        </span>
      </div>

      <input
        id={id}
        type="range"
        className="threshold__slider"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        aria-valuetext={formatPercent(value, 0)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="threshold__scale" aria-hidden="true">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </section>
  );
}
