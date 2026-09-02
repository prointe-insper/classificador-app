import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Idioma do OCR. O tesseract baixa o modelo correspondente sob demanda. */
const OCR_LANG = 'por';

/**
 * Abaixo disso a "camada de texto" do PDF é ruído (carimbo, numeração de
 * página) e não uma petição: vale tentar o OCR. Uma petição inicial de verdade
 * passa fácil de mil caracteres.
 */
const MIN_CHARS_TEXTO = 200;

/** Escala de renderização para o OCR: ~150 dpi, suficiente para texto jurídico. */
const OCR_SCALE = 2;

export type StatusCallback = (mensagem: string) => void;

/** Texto embutido no PDF, quando existe. */
async function textoNativo(data: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const paginas: string[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      paginas.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return paginas.join('\n').trim();
  } finally {
    await doc.cleanup();
  }
}

/**
 * OCR das páginas do PDF, para digitalizações sem camada de texto.
 *
 * O tesseract.js entra por import dinâmico: quem só manda PDF com texto nunca
 * baixa o runtime nem o modelo de idioma. O reconhecimento roda no navegador,
 * em WebAssembly. O que trafega é o modelo do tesseract vindo do CDN, nunca o
 * documento.
 */
async function ocrPdf(
  data: Uint8Array,
  nome: string,
  onStatus?: StatusCallback,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  onStatus?.(`${nome}: preparando o OCR (na primeira vez baixa o modelo de português)...`);
  const worker = await createWorker(OCR_LANG);

  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const paginas: string[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      onStatus?.(`${nome}: OCR da página ${i} de ${doc.numPages}...`);
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('O navegador não permitiu renderizar a página para OCR.');
      }
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const { data: resultado } = await worker.recognize(canvas);
      paginas.push(resultado.text);
      // Libera a memória do canvas antes da próxima página.
      canvas.width = 0;
      canvas.height = 0;
    }
    return paginas.join('\n').trim();
  } finally {
    await doc.cleanup();
    await worker.terminate();
  }
}

/** OCR de uma imagem solta (PNG, JPG, TIFF...). */
async function ocrImagem(file: File, onStatus?: StatusCallback): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  onStatus?.(`${file.name}: preparando o OCR...`);
  const worker = await createWorker(OCR_LANG);
  try {
    onStatus?.(`${file.name}: reconhecendo o texto...`);
    const { data } = await worker.recognize(file);
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}

/**
 * Extrai o texto de um PDF: usa a camada de texto quando ela existe e cai para
 * o OCR quando o PDF é digitalização.
 */
export async function extractPdfText(file: File, onStatus?: StatusCallback): Promise<string> {
  // O pdf.js consome (detaches) o Uint8Array que recebe, e o arquivo pode
  // precisar de duas leituras: texto nativo e depois OCR. Daí as cópias.
  const data = new Uint8Array(await file.arrayBuffer());
  const nativo = await textoNativo(data.slice());
  if (nativo.length >= MIN_CHARS_TEXTO) {
    return nativo;
  }
  const reconhecido = await ocrPdf(data.slice(), file.name, onStatus);
  const melhor = reconhecido.length >= nativo.length ? reconhecido : nativo;
  if (!melhor) {
    throw new Error(`${file.name}: não foi possível extrair texto, nem por OCR.`);
  }
  return melhor;
}

const EXTENSOES_IMAGEM = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp'];

export async function extractText(file: File, onStatus?: StatusCallback): Promise<string> {
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.pdf')) {
    return extractPdfText(file, onStatus);
  }
  if (EXTENSOES_IMAGEM.some((ext) => nome.endsWith(ext))) {
    return ocrImagem(file, onStatus);
  }
  return file.text();
}
