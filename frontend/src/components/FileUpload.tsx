import { useId, useRef, useState } from 'react';
import { formatFileSize } from '../utils/format';

export const ACCEPTED_EXTENSIONS =
  '.txt,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp';

interface FileUploadProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function FileUpload({
  file,
  onFileChange,
  onSubmit,
  loading,
}: FileUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function openPicker() {
    inputRef.current?.click();
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
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) {
      onFileChange(dropped);
    }
  }

  return (
    <section className="card" aria-labelledby={`${inputId}-title`}>
      <h2 className="card__title" id={`${inputId}-title`}>
        1 · Documento da petição
      </h2>

      <div
        className={`upload__dropzone${dragActive ? ' upload__dropzone--active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Selecionar arquivo para classificação. Aceita TXT, PDF e imagens."
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
          Arraste o arquivo aqui ou <strong>clique para selecionar</strong>
        </span>
        <span className="upload__hint">
          TXT, PDF ou imagem (PNG, JPG, TIFF, BMP, WEBP)
        </span>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="visually-hidden"
        accept={ACCEPTED_EXTENSIONS}
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      {file ? (
        <div className="upload__file">
          <span aria-hidden="true">🗎</span>
          <div>
            <div className="upload__file-name">{file.name}</div>
            <div className="upload__file-size">{formatFileSize(file.size)}</div>
          </div>
          <button
            type="button"
            className="upload__file-remove"
            aria-label="Remover arquivo selecionado"
            onClick={() => onFileChange(null)}
          >
            ✕
          </button>
        </div>
      ) : null}

      <div className="upload__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!file || loading}
          onClick={onSubmit}
        >
          {loading ? (
            <>
              <span className="btn__spinner" aria-hidden="true" />
              Classificando…
            </>
          ) : (
            'Classificar'
          )}
        </button>
      </div>
    </section>
  );
}
