import { predictProba } from './forest';
import { documentVector } from './tfidf';
import type { Prediction, WebModel } from './types';

/**
 * Conectivos que o TF-IDF do juriclass não remove (ele filtra por frequência,
 * não por stopword) e que dominariam o destaque num documento real. Mesma lista
 * do backend e do juriclass-webapp, para que os termos destacados coincidam.
 */
const STOPWORDS = new Set(
  ('a à às ao aos aquela aquelas aquele aqueles aquilo as até com como da das de dela ' +
    'delas dele deles depois do dos e é ela elas ele eles em entre era essa essas esse ' +
    'esses esta está estas este estes eu foi for isso isto já lhe lhes mais mas me mesmo ' +
    'meu meus minha minhas muito na não nas nem no nos nós nossa nossas nosso nossos num ' +
    'numa o os ou para pela pelas pelo pelos por qual quando que quem se sem seu seus só ' +
    'sua suas também te tu tua tuas um uma você vocês vos').split(' '),
);

export function predict(text: string, model: WebModel, topK = 12): Prediction {
  const x = documentVector(text, model);
  const proba = predictProba(model.forest, x);

  let melhor = 0;
  for (let i = 1; i < proba.length; i += 1) {
    if (proba[i] > proba[melhor]) {
      melhor = i;
    }
  }

  const probabilities = model.labels
    .map((label, i) => ({ label, probability: proba[i] }))
    .sort((a, b) => b.probability - a.probability);

  // Peso TF-IDF do documento x importância global da floresta, a mesma
  // aproximação do backend: mede influência, não direção a favor da classe.
  const pesos: { token: string; weight: number }[] = [];
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] > 0) {
      const token = model.terms[i];
      if (!STOPWORDS.has(token)) {
        const weight = x[i] * model.featureImportances[i];
        if (weight > 0) {
          pesos.push({ token, weight });
        }
      }
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
