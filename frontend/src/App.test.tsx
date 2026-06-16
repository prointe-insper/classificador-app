import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ApiError, type PredictionResponse } from './types';
import * as client from './api/client';

vi.mock('./api/client');

function prediction(over: Partial<PredictionResponse> = {}): PredictionResponse {
  return {
    predicted_label: 'ICMS Declarado',
    confidence: 0.83,
    threshold: 0.5,
    needs_manual_review: false,
    decision_label: 'ICMS Declarado',
    probabilities: [
      { label: 'ICMS Declarado', probability: 0.83 },
      { label: 'IPVA', probability: 0.12 },
      { label: 'Outro', probability: 0.05 },
    ],
    explanation: [
      { token: 'icms declarado', weight: 1.23 },
      { token: 'isento', weight: -0.4 },
    ],
    char_count: 1234,
    ocr_used: false,
    source: 'pdf',
    model_id: 'pge-tfidf-xgboost-v1',
    ...over,
  };
}

function makeFile(name = 'peticao.txt') {
  return new File(['conteúdo da petição'], name, { type: 'text/plain' });
}

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('App (classificação em lote)', () => {
  beforeEach(() => {
    vi.mocked(client.getHealth).mockResolvedValue({
      status: 'ok',
      model_loaded: true,
    });
    vi.mocked(client.getModelInfo).mockResolvedValue({
      model_type: 'XGBoost',
      target_column: 'assunto',
      n_documents: 5000,
      n_features: 2048,
      label_names: ['ICMS Declarado', 'IPVA', 'Outro'],
      class_distribution: { 'ICMS Declarado': 2000, IPVA: 1500, Outro: 1500 },
    });
    vi.mocked(client.getModels).mockResolvedValue({
      models: [
        {
          id: 'pge-tfidf-xgboost-v1',
          name: 'PGE · TF-IDF + XGBoost (v1)',
          description: 'modelo padrão',
          is_default: true,
        },
      ],
      default_id: 'pge-tfidf-xgboost-v1',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('classifies a single file and renders a results table row', async () => {
    vi.mocked(client.predict).mockResolvedValue(prediction());
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.upload(fileInput(container), makeFile());
    await user.click(screen.getByRole('button', { name: /Classificar/ }));

    await waitFor(() => {
      expect(screen.getByTestId('results-table')).toBeInTheDocument();
    });
    const rows = screen.getAllByTestId('results-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('peticao.txt')).toBeInTheDocument();
    expect(within(rows[0]).getByText('ICMS Declarado')).toBeInTheDocument();
    expect(client.predict).toHaveBeenCalledWith(
      expect.any(File),
      0.5,
      'pge-tfidf-xgboost-v1',
    );
  });

  it('runs the model once per file and shows a row for each', async () => {
    vi.mocked(client.predict)
      .mockResolvedValueOnce(prediction({ predicted_label: 'ICMS Declarado' }))
      .mockResolvedValueOnce(prediction({ predicted_label: 'IPVA' }));
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.upload(fileInput(container), [makeFile('a.txt'), makeFile('b.txt')]);
    expect(screen.getByTestId('upload-count')).toHaveTextContent('2 arquivos');

    await user.click(screen.getByRole('button', { name: /Classificar 2 documentos/ }));

    await waitFor(() => {
      expect(screen.getAllByTestId('results-row')).toHaveLength(2);
    });
    expect(client.predict).toHaveBeenCalledTimes(2);
  });

  it('marks a prediction incorrect and reveals the correct-label dropdown', async () => {
    vi.mocked(client.predict).mockResolvedValue(prediction());
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.upload(fileInput(container), makeFile());
    await user.click(screen.getByRole('button', { name: /Classificar/ }));

    await waitFor(() => screen.getByTestId('results-table'));

    expect(screen.queryByTestId('feedback-correct-label')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('feedback-incorrect'));

    const dropdown = screen.getByTestId('feedback-correct-label');
    expect(dropdown).toBeInTheDocument();
    // Dropdown is populated from the taxonomy (model label_names).
    expect(within(dropdown).getByRole('option', { name: 'IPVA' })).toBeInTheDocument();

    await user.selectOptions(dropdown, 'IPVA');
    expect((dropdown as HTMLSelectElement).value).toBe('IPVA');
  });

  it('exports the table to Excel including feedback', async () => {
    vi.mocked(client.predict).mockResolvedValue(prediction());
    const blob = new Blob(['xlsx']);
    vi.mocked(client.exportXlsx).mockResolvedValue({
      blob,
      filename: 'classificacoes_20260616_120000.xlsx',
    });
    const createUrl = vi.fn(() => 'blob:url');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.upload(fileInput(container), makeFile());
    await user.click(screen.getByRole('button', { name: /Classificar/ }));
    await waitFor(() => screen.getByTestId('results-table'));

    await user.click(screen.getByTestId('feedback-incorrect'));
    await user.selectOptions(screen.getByTestId('feedback-correct-label'), 'IPVA');
    await user.click(screen.getByTestId('export-button'));

    await waitFor(() => expect(client.exportXlsx).toHaveBeenCalledTimes(1));
    const [rows] = vi.mocked(client.exportXlsx).mock.calls[0];
    expect(rows[0].feedback_status).toBe('incorreto');
    expect(rows[0].correct_label).toBe('IPVA');
    expect(clickSpy).toHaveBeenCalled();

    vi.unstubAllGlobals();
    clickSpy.mockRestore();
  });

  it('shows a per-row error when a prediction fails', async () => {
    vi.mocked(client.predict).mockRejectedValue(
      new ApiError('Arquivo corrompido.', 400),
    );
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.upload(fileInput(container), makeFile());
    await user.click(screen.getByRole('button', { name: /Classificar/ }));

    await waitFor(() => {
      expect(screen.getByText(/Arquivo corrompido\./)).toBeInTheDocument();
    });
    const row = screen.getByTestId('results-row');
    expect(row.getAttribute('data-status')).toBe('error');
  });

  it('shows the model-not-loaded banner when health reports 503', async () => {
    vi.mocked(client.getHealth).mockRejectedValue(
      new ApiError('Modelo não carregado', 503),
    );
    vi.mocked(client.getModelInfo).mockRejectedValue(
      new ApiError('Modelo não carregado', 503),
    );

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Modelo indisponível/i)).toBeInTheDocument();
    });
  });

  it('renders the model selector and model info footer', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('model-select')).toBeInTheDocument();
    });
    expect(screen.getByTestId('model-info-footer')).toBeInTheDocument();
    expect(
      (screen.getByTestId('model-select') as HTMLSelectElement).value,
    ).toBe('pge-tfidf-xgboost-v1');
  });
});
