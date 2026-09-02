export interface WebModel {
  labels: string[];
  chunkWords: number;
  overlap: number;
  /** termo -> índice da coluna no espaço TF-IDF */
  vocabulary: Map<string, number>;
  terms: string[];
  idf: Float64Array;
  sublinearTf: boolean;
  featureImportances: Float64Array;
  forest: Forest;
}

export interface Forest {
  nTrees: number;
  nClasses: number;
  treeOffsets: Int32Array;
  feature: Int32Array;
  threshold: Float64Array;
  left: Int32Array;
  right: Int32Array;
  leafIndex: Int32Array;
  leafValues: Float32Array;
}

export interface Prediction {
  label: string;
  confidence: number;
  probabilities: { label: string; probability: number }[];
  explanation: { token: string; weight: number }[];
}
