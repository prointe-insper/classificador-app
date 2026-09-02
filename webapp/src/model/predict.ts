import { predictProba } from './forest';
import { documentVector } from './tfidf';
import type { Prediction, WebModel } from './types';
import { predictProbaXgb } from './xgboost';

/**
 * Conectivos que o TF-IDF não remove (ele filtra por frequência, não por
 * stopword) e que dominariam o destaque num documento real. Mesma lista do
 * backend e do juriclass-webapp, para que os termos destacados coincidam.
 */
const STOPWORDS = new Set(
  ('a à às ao aos aquela aquelas aquele aqueles aquilo as até com como da das de dela ' +
    'delas dele deles depois do dos e é ela elas ele eles em entre era essa essas esse ' +
    'esses esta está estas este estes eu foi for isso isto já lhe lhes mais mas me mesmo ' +
    'meu meus minha minhas muito na não nas nem no nos nós nossa nossas nosso nossos num ' +
    'numa o os ou para pela pelas pelo pelos por qual quando que quem se sem seu seus só ' +
    'sua suas também te tu tua tuas um uma você vocês vos').split(' '),
);

/** Um termo é descartado da explicação se ele todo for stopword. */
function ehStopword(termo: string): boolean {
  return termo.split(' ').every((parte) => STOPWORDS.has(parte));
}

export function predict(text: string, model: WebModel, topK = 12): Prediction {
  const x = documentVector(text, model);
  const proba =
    model.forest.kind === 'xgboost'
      ? predictProbaXgb(model.forest, x)
      : predictProba(model.forest, x);

  let melhor = 0;
  for (let i = 1; i < proba.length; i += 1) {
    if (proba[i] > proba[melhor]) {
      melhor = i;
    }
  }

  const probabilities = model.labels
    .map((label, i) => ({ label, probability: proba[i] }))
    .sort((a, b) => b.probability - a.probability);

  // Peso TF-IDF do documento x importância global do estimador. É a mesma
  // aproximação que o backend usa para o Random Forest. Para o modelo v1 o
  // backend usa TreeSHAP, que é exato e com sinal; aqui a explicação do v1 é
  // esta aproximação, e a interface diz isso.
  // Percorre em ordem crescente de índice, e não na ordem de inserção do mapa:
  // o backend monta a lista iterando as colunas não nulas em ordem, e tanto o
  // sort do Python quanto o do JavaScript são estáveis. Sem isso, termos de
  // peso empatado sairiam em ordem diferente da do backend.
  const entradas = [...x.entries()].sort((a, b) => a[0] - b[0]);
  const pesos: { token: string; weight: number }[] = [];
  for (const [index, valor] of entradas) {
    if (valor <= 0) {
      continue;
    }
    const token = model.terms[index];
    if (ehStopword(token)) {
      continue;
    }
    const weight = valor * model.featureImportances[index];
    if (weight > 0) {
      pesos.push({ token, weight });
    }
  }
  pesos.sort((a, b) => b.weight - a.weight);

  return {
    label: model.labels[melhor],
    confidence: proba[melhor],
    probabilities,
    explanation: pesos.slice(0, topK),
  };
}
