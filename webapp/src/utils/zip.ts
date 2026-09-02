import { Unzip, UnzipInflate, unzip as unzipBuffer } from 'fflate';

/**
 * Limite do .zip aceito no navegador. Espelha o `APP_MAX_UPLOAD_MB` do backend
 * (1 GB): o zip é descompactado aqui e cada documento vai ao backend numa
 * requisição própria, então o teto do backend vale por documento e este vale
 * pelo lote. Manter os dois iguais evita a situação de aceitar um lote que
 * depois falha documento a documento.
 */
export const MAX_ZIP_BYTES = 1024 * 1024 * 1024;

/** Extensões que o backend sabe extrair; o resto do zip é ignorado. */
const SUPPORTED_ENTRY_EXTENSIONS = [
  '.txt',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.tif',
  '.tiff',
  '.bmp',
  '.webp',
];

export interface ZipExpansion {
  /** Documentos extraídos, prontos para o mesmo fluxo dos arquivos soltos. */
  files: File[];
  /** Entradas ignoradas por não serem um formato suportado. */
  skipped: number;
}

export function isZip(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip');
}

/** Nome do arquivo sem o caminho de pastas interno ao zip. */
function baseName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

/**
 * Decide se a entrada do zip vira documento, é lixo de empacotador (a ser
 * ignorado em silêncio) ou é formato não suportado (a ser contado).
 */
function classifyEntry(path: string): 'take' | 'ignore' | 'unsupported' {
  const name = baseName(path);
  const isDirectory = path.endsWith('/');
  const isPackagingNoise =
    path.startsWith('__MACOSX/') || name.startsWith('.') || name === '';
  if (isDirectory || isPackagingNoise) {
    return 'ignore';
  }
  const lower = name.toLowerCase();
  return SUPPORTED_ENTRY_EXTENSIONS.some((ext) => lower.endsWith(ext))
    ? 'take'
    : 'unsupported';
}

/**
 * Descompacta um .zip de petições no próprio navegador.
 *
 * Consome o arquivo como stream quando o browser oferece `File.stream()`, para
 * não manter o zip inteiro e o conteúdo descompactado em memória ao mesmo
 * tempo. Cai para o caminho em buffer quando o stream não existe (jsdom, nos
 * testes).
 */
export async function expandZip(file: File): Promise<ZipExpansion> {
  if (file.size > MAX_ZIP_BYTES) {
    throw new Error(
      `O arquivo ${file.name} tem ${(file.size / 1024 ** 3).toFixed(2)} GB e ` +
        'excede o limite de 1 GB por lote. Divida o zip em partes menores.',
    );
  }
  return typeof file.stream === 'function'
    ? expandStreaming(file)
    : expandBuffered(file);
}

function expandStreaming(file: File): Promise<ZipExpansion> {
  return new Promise<ZipExpansion>((resolve, reject) => {
    const files: File[] = [];
    const pending = new Set<string>();
    let skipped = 0;
    let streamEnded = false;

    const settleIfDone = () => {
      if (streamEnded && pending.size === 0) {
        resolve({ files, skipped });
      }
    };

    const unzipper = new Unzip((entry) => {
      const kind = classifyEntry(entry.name);
      if (kind !== 'take') {
        if (kind === 'unsupported') {
          skipped += 1;
        }
        return; // não chamar start() descarta a entrada
      }
      const chunks: BlobPart[] = [];
      pending.add(entry.name);
      entry.ondata = (err, chunk, final) => {
        if (err) {
          reject(err);
          return;
        }
        if (chunk.length > 0) {
          // Cópia com buffer próprio: o fflate reaproveita o buffer entre
          // chunks, e o tipo do TS exige um ArrayBuffer (não SharedArrayBuffer).
          chunks.push(new Uint8Array(chunk));
        }
        if (final) {
          files.push(new File([new Blob(chunks)], baseName(entry.name)));
          pending.delete(entry.name);
          settleIfDone();
        }
      };
      entry.start();
    });
    unzipper.register(UnzipInflate);

    (async () => {
      const reader = file.stream().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          unzipper.push(new Uint8Array(0), true);
          break;
        }
        unzipper.push(value, false);
      }
      streamEnded = true;
      settleIfDone();
    })().catch(reject);
  });
}

/**
 * Lê o arquivo inteiro em bytes. Usa `arrayBuffer()` quando existe e cai para o
 * `FileReader` no jsdom, que não implementa nenhum dos dois caminhos modernos.
 */
async function readAllBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
    reader.readAsArrayBuffer(file);
  });
  return new Uint8Array(buffer);
}

async function expandBuffered(file: File): Promise<ZipExpansion> {
  const buffer = await readAllBytes(file);
  return new Promise<ZipExpansion>((resolve, reject) => {
    unzipBuffer(buffer, (err, entries) => {
      if (err) {
        reject(err);
        return;
      }
      const files: File[] = [];
      let skipped = 0;
      for (const [path, data] of Object.entries(entries)) {
        const kind = classifyEntry(path);
        if (kind === 'take') {
          files.push(new File([new Blob([new Uint8Array(data)])], baseName(path)));
        } else if (kind === 'unsupported') {
          skipped += 1;
        }
      }
      resolve({ files, skipped });
    });
  });
}
