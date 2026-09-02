export interface WebModel {
  id: string;
  labels: string[];
  modelType: string;
  /** Ausente quando o documento é vetorizado inteiro (modelo v1). */
  chunking: { chunkWords: number; overlap: number } | null;
  /** "raw" entrega o texto cru; "clean" replica o clean_for_model do backend. */
  preprocess: 'raw' | 'clean';
  /** termo -> índice da coluna no espaço TF-IDF */
  vocabulary: Map<string, number>;
  terms: string[];
  idf: Float64Array;
  sublinearTf: boolean;
  /** 1 = só unigramas; 2 = unigramas e bigramas. */
  ngramMax: number;
  featureImportances: Float64Array;
  forest: Forest;
}

export type Forest = SklearnForest | XgbForest;

export interface SklearnForest {
  kind: 'sklearn_forest';
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

export interface XgbForest {
  kind: 'xgboost';
  nTrees: number;
  nClasses: number;
  treeOffsets: Int32Array;
  feature: Int32Array;
  threshold: Float64Array;
  yes: Int32Array;
  no: Int32Array;
  missing: Int32Array;
  leafValue: Float64Array;
  baseScore: Float64Array;
}

/**
 * Documento em representação esparsa: índice da feature -> peso TF-IDF.
 *
 * Esparso e não denso porque o XGBoost distingue "zero" de "ausente": ausente
 * segue o ramo `missing` do nó. Para o Random Forest, ausente é lido como zero,
 * que é o comportamento do vetor denso do sklearn.
 */
export type SparseDoc = Map<number, number>;

export interface Prediction {
  label: string;
  confidence: number;
  probabilities: { label: string; probability: number }[];
  explanation: { token: string; weight: number }[];
}
