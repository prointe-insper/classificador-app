import { useId, useRef, useState } from 'react';
import { formatFileSize } from '../utils/format';
import { expandZip, isZip } from '../utils/zip';

export const ACCEPTED_EXTENSIONS =
  '.txt,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,.zip';

interface MultiFileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  onSubmit: () => void;
  loading: boolean;
  /** Reporta falha ao abrir um zip (corrompido ou acima do limite). */
  onError?: (message: string) => void;
}

/** Chave estável para deduplicar/identificar um arquivo na lista. */
function fileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function MultiFileUpload({
  files,
  onFilesChange,
  onSubmit,
  loading,
  onError,
}: MultiFileUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [skipped, setSkipped] = useState(0);

  function openPicker() {
    inputRef.current?.click();
  }

  /**
   * Troca cada .zip da seleção pelos documentos que ele contém, para que o
   * lote siga pelo mesmo caminho dos arquivos soltos.
   */
  async function expandArchives(incoming: File[]): Promise<File[]> {
    if (!incoming.some(isZip)) {
      setSkipped(0);
      return incoming;
    }
    setExpanding(true);
    try {
      const expanded: File[] = [];
      let ignored = 0;
      for (const file of incoming) {
        if (!isZip(file)) {
          expanded.push(file);
          continue;
        }
        const result = await expandZip(file);
        if (result.files.length === 0) {
          throw new Error(
            `O arquivo ${file.name} não tem nenhum documento em formato ` +
              'suportado (TXT, PDF ou imagem).',
          );
        }
        expanded.push(...result.files);
        ignored += result.skipped;
      }
      setSkipped(ignored);
      return expanded;
    } finally {
      setExpanding(false);
    }
  }

  async function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) {
      return;
    }
    let candidates: File[];
    try {
      candidates = await expandArchives(Array.from(incoming));
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : 'Não foi possível abrir o zip.',
      );
      return;
    }
    const existing = new Set(files.map(fileKey));
    const merged = [...files];
    for (const f of candidates) {
      if (!existing.has(fileKey(f))) {
        existing.add(fileKey(f));
        merged.push(f);
      }
    }
    onFilesChange(merged);
  }

  function removeAt(index: number) {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    addFiles(event.dataTransfer.files);
  }

  const count = files.length;
  const submitLabel =
    count <= 1 ? 'Classificar' : `Classificar ${count} documentos`;

  return (
    <section className="card" aria-labelledby={`${inputId}-title`}>
      <h2 className="card__title" id={`${inputId}-title`}>
        1 · Documentos da petição
      </h2>

      <div
        className={`upload__dropzone${dragActive ? ' upload__dropzone--active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Selecionar arquivos para classificação. Aceita TXT, PDF, imagens e um zip com o lote. Vários arquivos são permitidos."
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <span className="upload__icon" aria-hidden="true">
          📄
        </span>
        <span>
          Arraste os arquivos aqui ou <strong>clique para selecionar</strong>
        </span>
        <span className="upload__hint">
          Vários arquivos · TXT, PDF ou imagem (PNG, JPG, TIFF, BMP, WEBP)
        </span>
        <span className="upload__hint">
          Ou um <strong>.zip</strong> com o lote inteiro (até 1 GB)
        </span>
      </div>

      {expanding ? (
        <p className="upload__status" role="status" data-testid="zip-expanding">
          Abrindo o zip e listando os documentos...
        </p>
      ) : null}

      {skipped > 0 ? (
        <p className="upload__status" role="status" data-testid="zip-skipped">
          {skipped}{' '}
          {skipped === 1 ? 'arquivo do zip foi ignorado' : 'arquivos do zip foram ignorados'}{' '}
          por não ser formato suportado.
        </p>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        className="visually-hidden"
        accept={ACCEPTED_EXTENSIONS}
        onChange={(e) => {
          addFiles(e.target.files);
          // Permite re-selecionar o mesmo arquivo após remover.
          e.target.value = '';
        }}
      />

      {count > 0 ? (
        <ul className="upload__list" aria-label="Arquivos selecionados">
          {files.map((file, index) => (
            <li className="upload__file" key={fileKey(file)} data-testid="upload-item">
              <span aria-hidden="true">🗎</span>
              <div className="upload__file-info">
                <div className="upload__file-name" title={file.name}>
                  {file.name}
                </div>
                <div className="upload__file-size">
                  {formatFileSize(file.size)}
                </div>
              </div>
              <button
                type="button"
                className="upload__file-remove"
                aria-label={`Remover ${file.name}`}
                disabled={loading}
                onClick={() => removeAt(index)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="upload__actions">
        {count > 0 ? (
          <span className="upload__count" data-testid="upload-count">
            {count} {count === 1 ? 'arquivo' : 'arquivos'}
          </span>
        ) : null}
        <button
          type="button"
          className="btn btn--primary"
          disabled={count === 0 || loading}
          onClick={onSubmit}
        >
          {loading ? (
            <>
              <span className="btn__spinner" aria-hidden="true" />
              Classificando…
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </section>
  );
}
