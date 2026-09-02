import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { MAX_ZIP_BYTES, expandZip, isZip } from './zip';

/** Monta um File .zip em memória, sem `File.stream` (caminho de buffer). */
function makeZip(entries: Record<string, string>, name = 'lote.zip'): File {
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, content]) => [path, strToU8(content)]),
    ),
  );
  return new File([new Blob([zipped])], name);
}

/** O File do jsdom não tem `.text()`; lê pelo FileReader. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

describe('isZip', () => {
  it('reconhece a extensão, sem depender da caixa', () => {
    expect(isZip(new File([''], 'lote.zip'))).toBe(true);
    expect(isZip(new File([''], 'LOTE.ZIP'))).toBe(true);
    expect(isZip(new File([''], 'peticao.pdf'))).toBe(false);
  });
});

describe('expandZip', () => {
  it('extrai os documentos suportados', async () => {
    const zip = makeZip({
      'a.txt': 'peticao a',
      'b.txt': 'peticao b',
    });
    const { files, skipped } = await expandZip(zip);
    expect(files.map((f) => f.name).sort()).toEqual(['a.txt', 'b.txt']);
    expect(skipped).toBe(0);
    expect(await readText(files[0])).toBe('peticao a');
  });

  it('achata as pastas internas do zip', async () => {
    const zip = makeZip({ 'nucleo/2026/peticao.txt': 'conteudo' });
    const { files } = await expandZip(zip);
    expect(files.map((f) => f.name)).toEqual(['peticao.txt']);
  });

  it('conta os formatos não suportados e ignora lixo de empacotador', async () => {
    const zip = makeZip({
      'peticao.txt': 'ok',
      'planilha.xlsx': 'nao suportado',
      'leiame.docx': 'nao suportado',
      '__MACOSX/._peticao.txt': 'lixo',
      '.DS_Store': 'lixo',
    });
    const { files, skipped } = await expandZip(zip);
    expect(files.map((f) => f.name)).toEqual(['peticao.txt']);
    expect(skipped).toBe(2);
  });

  it('recusa zip acima do limite sem tentar abrir', async () => {
    const grande = new File([''], 'gigante.zip');
    Object.defineProperty(grande, 'size', { value: MAX_ZIP_BYTES + 1 });
    await expect(expandZip(grande)).rejects.toThrow(/limite de 1 GB/);
  });

  it('propaga erro de zip corrompido', async () => {
    const corrompido = new File([new Blob([new Uint8Array([1, 2, 3, 4])])], 'ruim.zip');
    await expect(expandZip(corrompido)).rejects.toThrow();
  });
});
