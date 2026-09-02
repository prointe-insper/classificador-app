import type { XgbForest } from './types';

/**
 * `predict_proba` de um `XGBClassifier` com objetivo `multi:softprob`.
 *
 * Recebe o documento como **mapa esparso** (índice da feature → valor), e não
 * como vetor denso, porque essa distinção muda a resposta: o backend prediz
 * sobre a matriz esparsa do TF-IDF, e o XGBoost trata entrada ausente como
 * valor faltante, seguindo o ramo `missing` do nó. Um vetor denso com zeros
 * desceria pelo ramo do `< split_condition` na maioria dos nós e daria outra
 * classe.
 *
 * Diferenças em relação ao Random Forest do sklearn, todas relevantes:
 * a comparação é estrita (`<`), as árvores somam margem em vez de média de
 * probabilidade, a classe da árvore `t` é `t % n_classes`, e o `base_score` é
 * um vetor por classe (fosse escalar, sumiria no softmax).
 */
export function predictProbaXgb(forest: XgbForest, x: Map<number, number>): Float64Array {
  const margem = Float64Array.from(forest.baseScore);

  for (let tree = 0; tree < forest.nTrees; tree += 1) {
    let node = forest.treeOffsets[tree];
    while (forest.feature[node] !== -1) {
      const valor = x.get(forest.feature[node]);
      if (valor === undefined) {
        node = forest.missing[node];
      } else {
        node = valor < forest.threshold[node] ? forest.yes[node] : forest.no[node];
      }
    }
    margem[tree % forest.nClasses] += forest.leafValue[node];
  }

  return softmax(margem);
}

function softmax(margem: Float64Array): Float64Array {
  // Desconta o máximo antes de exponenciar: sem isso, margens grandes estouram
  // para Infinity e a distribuição vira NaN.
  let maior = margem[0];
  for (let i = 1; i < margem.length; i += 1) {
    if (margem[i] > maior) {
      maior = margem[i];
    }
  }
  const saida = new Float64Array(margem.length);
  let soma = 0;
  for (let i = 0; i < margem.length; i += 1) {
    saida[i] = Math.exp(margem[i] - maior);
    soma += saida[i];
  }
  for (let i = 0; i < saida.length; i += 1) {
    saida[i] /= soma;
  }
  return saida;
}
