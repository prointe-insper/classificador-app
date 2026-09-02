import type { Forest } from './types';

/**
 * Média das distribuições de classe das árvores, que é o `predict_proba` do
 * RandomForestClassifier. A condição de descida é `x[feature] <= threshold`
 * para a esquerda, igual à do sklearn.
 */
export function predictProba(forest: Forest, x: Float64Array): Float64Array {
  const soma = new Float64Array(forest.nClasses);
  for (let tree = 0; tree < forest.nTrees; tree += 1) {
    let node = forest.treeOffsets[tree];
    while (forest.feature[node] !== -1) {
      node =
        x[forest.feature[node]] <= forest.threshold[node]
          ? forest.left[node]
          : forest.right[node];
    }
    const base = forest.leafIndex[node] * forest.nClasses;
    for (let c = 0; c < forest.nClasses; c += 1) {
      soma[c] += forest.leafValues[base + c];
    }
  }
  for (let c = 0; c < forest.nClasses; c += 1) {
    soma[c] /= forest.nTrees;
  }
  return soma;
}
