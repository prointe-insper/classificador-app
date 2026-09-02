import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Extrai a camada de texto de um PDF no próprio navegador.
 *
 * Só funciona com PDF que tem texto embutido. Digitalização pura exigiria OCR
 * (tesseract.js), que não entra nesta versão: a mensagem de erro deixa isso
 * claro em vez de devolver documento vazio para o classificador.
 */
export async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    paginas.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' '),
    );
  }
  await doc.cleanup();
  const texto = paginas.join('\n').trim();
  if (!texto) {
    throw new Error(
      `${file.name} não tem camada de texto (provavelmente é digitalização). ` +
        'Esta versão no navegador não faz OCR.',
    );
  }
  return texto;
}

export async function extractText(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(file);
  }
  return file.text();
}
