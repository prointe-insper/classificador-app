import { useId, useRef, useState } from 'react';
import { formatFileSize } from '../utils/format';

export const ACCEPTED_EXTENSIONS =
  '.txt,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp';

interface MultiFileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  onSubmit: () => void;
  loading: boolean;
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
}: MultiFileUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) {
      return;
    }
    const existing = new Set(files.map(fileKey));
    const merged = [...files];
    for (const f of Array.from(incoming)) {
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
        aria-label="Selecionar arquivos para classificação. Aceita TXT, PDF e imagens. Vários arquivos são permitidos."
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
      </div>

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
