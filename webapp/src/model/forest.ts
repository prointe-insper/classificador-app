import type { SklearnForest, SparseDoc } from './types';

/**
 * Média das distribuições de classe das árvores, que é o `predict_proba` do
 * RandomForestClassifier. A condição de descida é `x[feature] <= threshold`
 * para a esquerda, igual à do sklearn.
 *
 * Feature ausente no mapa vale zero: é o que o sklearn enxerga no vetor denso.
 * (O XGBoost, ao contrário, distingue ausente de zero; ver `xgboost.ts`.)
 */
export function predictProba(forest: SklearnForest, x: SparseDoc): Float64Array {
  const soma = new Float64Array(forest.nClasses);
  for (let tree = 0; tree < forest.nTrees; tree += 1) {
    let node = forest.treeOffsets[tree];
    while (forest.feature[node] !== -1) {
      const valor = x.get(forest.feature[node]) ?? 0;
      node = valor <= forest.threshold[node] ? forest.left[node] : forest.right[node];
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
