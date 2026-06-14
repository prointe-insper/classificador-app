import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUpload } from './FileUpload';

function makeFile(name = 'peticao.txt') {
  return new File(['conteúdo da petição'], name, { type: 'text/plain' });
}

describe('FileUpload', () => {
  it('disables the Classificar button when no file is selected', () => {
    render(
      <FileUpload
        file={null}
        onFileChange={() => {}}
        onSubmit={() => {}}
        loading={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Classificar' })).toBeDisabled();
  });

  it('shows the selected file name and size', () => {
    render(
      <FileUpload
        file={makeFile()}
        onFileChange={() => {}}
        onSubmit={() => {}}
        loading={false}
      />,
    );
    expect(screen.getByText('peticao.txt')).toBeInTheDocument();
  });

  it('calls onFileChange when a file is selected via the input', async () => {
    const onFileChange = vi.fn();
    const { container } = render(
      <FileUpload
        file={null}
        onFileChange={onFileChange}
        onSubmit={() => {}}
        loading={false}
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, makeFile());
    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange.mock.calls[0][0]).toBeInstanceOf(File);
  });

  it('calls onSubmit when Classificar is clicked with a file present', async () => {
    const onSubmit = vi.fn();
    render(
      <FileUpload
        file={makeFile()}
        onFileChange={() => {}}
        onSubmit={onSubmit}
        loading={false}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Classificar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state and disables the button while loading', () => {
    render(
      <FileUpload
        file={makeFile()}
        onFileChange={() => {}}
        onSubmit={() => {}}
        loading
      />,
    );
    expect(screen.getByRole('button', { name: /Classificando/ })).toBeDisabled();
  });
});
