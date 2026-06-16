import { useId } from 'react';
import type { ModelOption } from '../types';

interface ModelSelectorProps {
  models: ModelOption[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

/**
 * Seletor de modelo. Hoje há um único modelo, mas a lista vem da API e o
 * componente já está pronto para múltiplas opções no futuro.
 */
export function ModelSelector({
  models,
  value,
  onChange,
  disabled,
}: ModelSelectorProps) {
  const selectId = useId();
  const selected = models.find((m) => m.id === value);
  const single = models.length <= 1;

  return (
    <section className="card" aria-labelledby={`${selectId}-title`}>
      <h2 className="card__title" id={`${selectId}-title`}>
        Modelo de classificação
      </h2>
      <div className="model-selector">
        <label className="model-selector__label" htmlFor={selectId}>
          Modelo
        </label>
        <select
          id={selectId}
          className="model-selector__select"
          value={value}
          disabled={disabled || single}
          onChange={(e) => onChange(e.target.value)}
          data-testid="model-select"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {selected?.description ? (
          <p className="model-selector__desc">{selected.description}</p>
        ) : null}
        {single ? (
          <p className="model-selector__hint">
            Mais modelos serão disponibilizados futuramente.
          </p>
        ) : null}
      </div>
    </section>
  );
}
