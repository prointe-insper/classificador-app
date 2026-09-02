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

/** Lê o JSON produzido por `backend/model/export_web.py`. */
export function parseModel(payload: any): WebModel {
  if (payload?.format !== 'classificador-web/1') {
    throw new Error(`Formato de modelo desconhecido: ${payload?.format}`);
  }
  const terms: string[] = payload.tfidf.terms;
  const vocabulary = new Map<string, number>();
  terms.forEach((term, index) => vocabulary.set(term, index));

  const f = payload.forest;
  const forest: Forest = {
    nTrees: f.n_trees,
    nClasses: f.n_classes,
    treeOffsets: asInt32(f.tree_offsets),
    feature: asInt32(f.feature),
    threshold: asFloat64(f.threshold),
    left: asInt32(f.left),
    right: asInt32(f.right),
    leafIndex: asInt32(f.leaf_index),
    leafValues: asFloat32(f.leaf_values),
  };

  return {
    labels: payload.labels,
    chunkWords: payload.chunking.chunk_words,
    overlap: payload.chunking.overlap,
    vocabulary,
    terms,
    idf: asFloat64(payload.tfidf.idf),
    sublinearTf: payload.tfidf.sublinear_tf,
    featureImportances: asFloat64(payload.feature_importances),
    forest,
  };
}

export async function loadModel(url: string): Promise<WebModel> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Não foi possível baixar o modelo (${response.status}).`);
  }
  return parseModel(await response.json());
}
