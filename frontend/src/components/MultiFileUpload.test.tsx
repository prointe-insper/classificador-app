import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import { MultiFileUpload } from './MultiFileUpload';

// lastModified fixo para que "o mesmo arquivo" seja realmente idêntico
// (o default é Date.now(), que varia entre duas chamadas).
function makeFile(name: string) {
  return new File(['x'], name, { type: 'text/plain', lastModified: 1700000000000 });
}

function makeZip(entries: Record<string, string>, name = 'lote.zip') {
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, content]) => [path, strToU8(content)]),
    ),
  );
  return new File([new Blob([zipped])], name, { lastModified: 1700000000000 });
}

/** Wrapper que mantém o estado dos arquivos como o App faria. */
function Harness({
  onSubmit = () => {},
  onError,
}: {
  onSubmit?: () => void;
  onError?: (message: string) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <MultiFileUpload
      files={files}
      onFilesChange={setFiles}
      onSubmit={onSubmit}
      loading={false}
      onError={onError}
    />
  );
}

function input(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('MultiFileUpload', () => {
  it('accepts multiple files and lists them', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    await user.upload(input(container), [makeFile('a.pdf'), makeFile('b.pdf')]);

    expect(screen.getAllByTestId('upload-item')).toHaveLength(2);
    expect(screen.getByTestId('upload-count')).toHaveTextContent('2 arquivos');
    expect(
      screen.getByRole('button', { name: /Classificar 2 documentos/ }),
    ).toBeEnabled();
  });

  it('deduplicates identical files', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    await user.upload(input(container), makeFile('a.pdf'));
    await user.upload(input(container), makeFile('a.pdf'));

    expect(screen.getAllByTestId('upload-item')).toHaveLength(1);
  });

  it('removes a file from the list', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    await user.upload(input(container), [makeFile('a.pdf'), makeFile('b.pdf')]);
    await user.click(screen.getByRole('button', { name: /Remover a.pdf/ }));

    const items = screen.getAllByTestId('upload-item');
    expect(items).toHaveLength(1);
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
  });

  it('disables submit with no files and submits when files exist', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Harness onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: 'Classificar' })).toBeDisabled();

    await user.upload(input(container), makeFile('a.pdf'));
    await user.click(screen.getByRole('button', { name: 'Classificar' }));
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe('MultiFileUpload com zip', () => {
  it('substitui o zip pelos documentos que ele contém', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, makeZip({ 'a.pdf': 'aa', 'sub/b.pdf': 'bb' }));

    await waitFor(() => {
      expect(screen.getAllByTestId('upload-item')).toHaveLength(2);
    });
    const nomes = screen
      .getAllByTestId('upload-item')
      .map((li) => li.textContent ?? '');
    expect(nomes.some((t) => t.includes('a.pdf'))).toBe(true);
    expect(nomes.some((t) => t.includes('b.pdf'))).toBe(true);
    // O próprio zip não fica na lista.
    expect(nomes.some((t) => t.includes('lote.zip'))).toBe(false);
  });

  it('avisa quantos arquivos do zip foram ignorados', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, makeZip({ 'a.pdf': 'aa', 'nota.xlsx': 'xx' }));

    await waitFor(() => {
      expect(screen.getByTestId('zip-skipped')).toHaveTextContent(
        /1 arquivo do zip foi ignorado/,
      );
    });
  });

  it('reporta erro quando o zip não tem documento suportado', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    render(<Harness onError={onError} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, makeZip({ 'nota.xlsx': 'xx' }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining('nenhum documento em formato suportado'),
      );
    });
    expect(screen.queryAllByTestId('upload-item')).toHaveLength(0);
  });
});
