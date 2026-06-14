/** Formats a 0..1 probability as a localized percentage string, e.g. 0.834 -> "83,4%". */
export function formatPercent(value: number, fractionDigits = 1): string {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return `${pct.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

/** Human-readable file size, e.g. 2048 -> "2,0 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} ${units[unitIndex]}`;
}

/** Friendly label for the prediction `source` field. */
export function formatSource(source: string): string {
  switch (source) {
    case 'text':
      return 'Texto (TXT)';
    case 'pdf':
      return 'PDF (texto)';
    case 'pdf+ocr':
      return 'PDF + OCR';
    case 'image':
      return 'Imagem (OCR)';
    default:
      return source;
  }
}
