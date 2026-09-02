/**
 * Porta de `app/services/preprocess.py` do backend.
 *
 * O modelo v1 foi treinado sobre texto passado pelo `clean_for_model`, então a
 * inferência tem que aplicar a mesma limpeza. O que muda o resultado de fato é
 * a remoção dos marcadores de página inseridos por OCR: sem ela, "PAGINA" e os
 * números de página viram tokens e entram no vetor TF-IDF.
 *
 * O modelo v2 usa `preprocess: "raw"` e não passa por aqui.
 */

const MARCADOR_PAGINA = /#\s*PAGINA\s*\d+\s*de\s*\d+\s*-*/gi;
const LINHA_REGUA = /[_-]{4,}/g;
const MULTIESPACO = /[ \t ]+/g;
const MULTIQUEBRA = /\n{3,}/g;

export function normalizeText(text: string): string {
  if (!text) {
    return '';
  }
  let s = text.normalize('NFC');
  s = s.replace(/ /g, ' ').replace(/​/g, '');
  s = s.replace(MARCADOR_PAGINA, ' ');
  s = s.replace(LINHA_REGUA, ' ');
  s = s.replace(MULTIESPACO, ' ');
  s = s.replace(MULTIQUEBRA, '\n\n');
  s = s
    .split('\n')
    .map((linha) => linha.trim())
    .join('\n');
  return s.trim();
}

/** Forma canônica consumida pelo vetorizador quando `preprocess` é "clean". */
export function cleanForModel(text: string): string {
  return normalizeText(text).toLowerCase();
}
