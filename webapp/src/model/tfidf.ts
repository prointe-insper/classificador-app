import type { WebModel } from './types';

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
 * Vetor TF-IDF de um chunk, na convenção do sklearn: tf sublinear (1 + ln tf),
 * multiplicado pelo idf e normalizado em L2. Escreve direto em `out`.
 */
function vectorizeChunk(chunk: string, model: WebModel, out: Float64Array): void {
  out.fill(0);
  const counts = new Map<number, number>();
  for (const token of tokenize(chunk)) {
    const index = model.vocabulary.get(token);
    if (index !== undefined) {
      counts.set(index, (counts.get(index) ?? 0) + 1);
    }
  }
  let quadrado = 0;
  for (const [index, count] of counts) {
    const tf = model.sublinearTf ? 1 + Math.log(count) : count;
    const valor = tf * model.idf[index];
    out[index] = valor;
    quadrado += valor * valor;
  }
  if (quadrado > 0) {
    const norma = Math.sqrt(quadrado);
    for (const index of counts.keys()) {
      out[index] /= norma;
    }
  }
}

/**
 * Representação do documento: média dos vetores TF-IDF dos chunks, que é como
 * o juriclass treinou o modelo.
 */
export function documentVector(text: string, model: WebModel): Float64Array {
  const chunks = chunkText(text, model.chunkWords, model.overlap);
  const total = new Float64Array(model.terms.length);
  const atual = new Float64Array(model.terms.length);
  for (const chunk of chunks) {
    vectorizeChunk(chunk, model, atual);
    for (let i = 0; i < total.length; i += 1) {
      total[i] += atual[i];
    }
  }
  for (let i = 0; i < total.length; i += 1) {
    total[i] /= chunks.length;
  }
  return total;
}
