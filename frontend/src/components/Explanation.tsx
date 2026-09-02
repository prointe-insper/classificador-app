import type { ExplanationItem } from '../types';

interface ExplanationProps {
  explanation: ExplanationItem[];
}

const MIN_FONT = 0.78; // rem
const MAX_FONT = 1.15; // rem

export function Explanation({ explanation }: ExplanationProps) {
  if (explanation.length === 0) {
    return null;
  }

  const maxAbs = explanation.reduce(
    (acc, item) => Math.max(acc, Math.abs(item.weight)),
    0,
  );

  // Render in descending importance (absolute weight) order.
  const ordered = [...explanation].sort(
    (a, b) => Math.abs(b.weight) - Math.abs(a.weight),
  );

  // Só os métodos com sinal (TreeSHAP) produzem peso negativo. O modelo atual
  // usa peso TF-IDF x importância do Random Forest, sempre >= 0: nesse caso não
  // faz sentido falar de termos "contra" a classe.
  const hasNegative = explanation.some((item) => item.weight < 0);

  return (
    <section className="card" aria-labelledby="explanation-title">
      <h2 className="card__title" id="explanation-title">
        Termos mais influentes
      </h2>
      <p className="card__caption">
        Estes são os termos que mais influenciaram a decisão do modelo.{' '}
        {hasNegative ? (
          <>
            Termos em vermelho empurram o documento <strong>em direção</strong> à
            classe prevista; termos em cinza empurram no sentido contrário.
          </>
        ) : (
          <>
            O peso combina a frequência do termo no documento com a importância
            dele para o modelo, então mede <strong>influência</strong>, não
            direção a favor ou contra a classe.
          </>
        )}{' '}
        O número é a influência do termo <strong>relativa ao termo mais
        influente</strong> do documento, e o tamanho acompanha essa mesma
        proporção.
      </p>

      <div className="chips">
        {ordered.map((item, index) => {
          const positive = item.weight >= 0;
          const ratio = maxAbs > 0 ? Math.abs(item.weight) / maxAbs : 0;
          const fontSize = MIN_FONT + ratio * (MAX_FONT - MIN_FONT);
          return (
            <span
              key={`${item.token}-${index}`}
              className={`chip ${positive ? 'chip--positive' : 'chip--negative'}`}
              style={{ fontSize: `${fontSize.toFixed(3)}rem` }}
              title={`peso bruto ${item.weight >= 0 ? '+' : ''}${item.weight.toExponential(2)}`}
              data-testid="explanation-chip"
              data-sign={positive ? 'positive' : 'negative'}
            >
              {item.token}
              <span className="chip__weight">
                {Math.round(ratio * 100)}%
              </span>
            </span>
          );
        })}
      </div>

      {hasNegative ? (
        <div className="chips__legend">
          <span className="chips__legend-item">
            <span className="chips__swatch chips__swatch--positive" aria-hidden="true" />
            A favor da classe
          </span>
          <span className="chips__legend-item">
            <span className="chips__swatch chips__swatch--negative" aria-hidden="true" />
            Contra a classe
          </span>
        </div>
      ) : null}
    </section>
  );
}
