import { cleanForModel } from './preprocess';
import type { SparseDoc, WebModel } from './types';

/**
 * Equivalente ao `token_pattern=r"(?u)\b\w\w+\b"` do scikit-learn.
 *
 * O `\w` do Python com re.UNICODE cobre letras, dígitos e underscore de
 * qualquer alfabeto; o `\w` do JavaScript é só ASCII, mesmo com a flag `u`.
 * Sem `\p{L}\p{N}` aqui, toda palavra acentuada ("execução", "dívida") seria
 * quebrada em pedaços e o vetor não bateria com o do treino. Casar sequências
 * maximais de 2+ caracteres de palavra é equivalente ao `\b\w\w+\b`, que é
 * guloso e ancorado nas duas bordas.
 */
const TOKEN_PATTERN = /[\p{L}\p{N}_]{2,}/gu;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_PATTERN) ?? [];
}

/**
 * Unigramas e, quando `ngramMax` é 2, também os bigramas, como o
 * `_word_ngrams` do sklearn: bigramas são pares adjacentes unidos por espaço.
 */
export function ngrams(tokens: string[], ngramMax: number): string[] {
  if (ngramMax < 2) {
    return tokens;
  }
  const saida = [...tokens];
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    saida.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return saida;
}

/**
 * Porta de `FixedChunker.split` do juriclass (e de `chunk_text` no backend).
 * Precisa continuar idêntica: o vocabulário foi ajustado sobre estes chunks.
 */
export function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return [''];
  }
  const step = chunkSize - overlap;
  const chunks: string[] = [];
  const limite = Math.max(1, words.length - overlap);
  for (let start = 0; start < limite; start += step) {
    const chunk = words.slice(start, start + chunkSize);
    if (chunk.length > 0) {
      chunks.push(chunk.join(' '));
    }
  }
  return chunks.length > 0 ? chunks : [''];
}

/**
 * Vetor TF-IDF de um trecho, na convenção do sklearn: tf sublinear
 * (1 + ln tf), multiplicado pelo idf e normalizado em L2.
 */
function vectorize(trecho: string, model: WebModel): SparseDoc {
  const counts = new Map<number, number>();
  for (const termo of ngrams(tokenize(trecho), model.ngramMax)) {
    const index = model.vocabulary.get(termo);
    if (index !== undefined) {
      counts.set(index, (counts.get(index) ?? 0) + 1);
    }
  }
  const vetor: SparseDoc = new Map();
  let quadrado = 0;
  for (const [index, count] of counts) {
    const tf = model.sublinearTf ? 1 + Math.log(count) : count;
    const valor = tf * model.idf[index];
    vetor.set(index, valor);
    quadrado += valor * valor;
  }
  if (quadrado > 0) {
    const norma = Math.sqrt(quadrado);
    for (const [index, valor] of vetor) {
      vetor.set(index, valor / norma);
    }
  }
  return vetor;
}

/**
 * Representação do documento.
 *
 * Com `chunking`, é a média dos vetores TF-IDF dos chunks, que é como o
 * juriclass treinou o modelo v2. Sem `chunking`, é o documento inteiro
 * vetorizado de uma vez, como o modelo v1.
 */
export function documentVector(text: string, model: WebModel): SparseDoc {
  const preparado = model.preprocess === 'raw' ? text : cleanForModel(text);
  if (!model.chunking) {
    return vectorize(preparado, model);
  }

  const chunks = chunkText(preparado, model.chunking.chunkWords, model.chunking.overlap);
  const total: SparseDoc = new Map();
  for (const chunk of chunks) {
    for (const [index, valor] of vectorize(chunk, model)) {
      total.set(index, (total.get(index) ?? 0) + valor);
    }
  }
  for (const [index, valor] of total) {
    total.set(index, valor / chunks.length);
  }
  return total;
}
