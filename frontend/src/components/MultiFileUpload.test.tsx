import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MultiFileUpload } from './MultiFileUpload';

// lastModified fixo para que "o mesmo arquivo" seja realmente idêntico
// (o default é Date.now(), que varia entre duas chamadas).
function makeFile(name: string) {
  return new File(['x'], name, { type: 'text/plain', lastModified: 1700000000000 });
}

/** Wrapper que mantém o estado dos arquivos como o App faria. */
function Harness({ onSubmit = () => {} }: { onSubmit?: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <MultiFileUpload
      files={files}
      onFilesChange={setFiles}
      onSubmit={onSubmit}
      loading={false}
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
