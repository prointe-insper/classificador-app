import type { Forest, WebModel } from './types';

function decode(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

const asInt32 = (b64: string) => new Int32Array(decode(b64));
const asFloat64 = (b64: string) => new Float64Array(decode(b64));
const asFloat32 = (b64: string) => new Float32Array(decode(b64));

function parseForest(f: any): Forest {
  const comum = {
    nTrees: f.n_trees as number,
    nClasses: f.n_classes as number,
    treeOffsets: asInt32(f.tree_offsets),
    feature: asInt32(f.feature),
    threshold: asFloat64(f.threshold),
  };
  if (f.kind === 'xgboost') {
    return {
      kind: 'xgboost',
      ...comum,
      yes: asInt32(f.yes),
      no: asInt32(f.no),
      missing: asInt32(f.missing),
      leafValue: asFloat64(f.leaf_value),
      baseScore: asFloat64(f.base_score),
    };
  }
  return {
    kind: 'sklearn_forest',
    ...comum,
    left: asInt32(f.left),
    right: asInt32(f.right),
    leafIndex: asInt32(f.leaf_index),
    leafValues: asFloat32(f.leaf_values),
  };
}

/** Lê o JSON produzido por `backend/model/export_web.py`. */
export function parseModel(payload: any, id = ''): WebModel {
  if (payload?.format !== 'classificador-web/2') {
    throw new Error(`Formato de modelo desconhecido: ${payload?.format}`);
  }
  const terms: string[] = payload.tfidf.terms;
  const vocabulary = new Map<string, number>();
  terms.forEach((term, index) => vocabulary.set(term, index));

  return {
    id,
    labels: payload.labels,
    modelType: payload.model_type ?? '',
    chunking: payload.chunking
      ? {
          chunkWords: payload.chunking.chunk_words,
          overlap: payload.chunking.overlap,
        }
      : null,
    preprocess: payload.preprocess === 'raw' ? 'raw' : 'clean',
    vocabulary,
    terms,
    idf: asFloat64(payload.tfidf.idf),
    sublinearTf: payload.tfidf.sublinear_tf,
    ngramMax: payload.tfidf.ngram_max ?? 1,
    featureImportances: asFloat64(payload.feature_importances),
    forest: parseForest(payload.forest),
  };
}

export async function loadModel(url: string, id = ''): Promise<WebModel> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Não foi possível baixar o modelo (${response.status}).`);
  }
  return parseModel(await response.json(), id);
}
