import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ApiError, type PredictionResponse } from './types';
import * as client from './api/client';

vi.mock('./api/client');

const PREDICTION: PredictionResponse = {
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
};

function makeFile() {
  return new File(['conteúdo da petição'], 'peticao.txt', {
    type: 'text/plain',
  });
}

describe('App integration', () => {
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a file, submits, and renders class, bars and explanation', async () => {
    vi.mocked(client.predict).mockResolvedValue(PREDICTION);
    const user = userEvent.setup();
    const { container } = render(<App />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile());

    await user.click(screen.getByRole('button', { name: 'Classificar' }));

    await waitFor(() => {
      expect(screen.getByTestId('result-card')).toBeInTheDocument();
    });

    expect(client.predict).toHaveBeenCalledWith(expect.any(File), 0.5);

    // Predicted class shown in the decision card.
    const card = screen.getByTestId('result-card');
    expect(card.getAttribute('data-decision')).toBe('accept');

    // Probability bars.
    expect(screen.getAllByTestId('prob-bar')).toHaveLength(3);

    // Explanation chips.
    expect(screen.getAllByTestId('explanation-chip')).toHaveLength(2);
  });

  it('recomputes the decision client-side when the threshold slider moves', async () => {
    vi.mocked(client.predict).mockResolvedValue(PREDICTION);
    const user = userEvent.setup();
    const { container } = render(<App />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile());
    await user.click(screen.getByRole('button', { name: 'Classificar' }));

    await waitFor(() => {
      expect(screen.getByTestId('result-card')).toBeInTheDocument();
    });
    expect(screen.getByTestId('result-card').getAttribute('data-decision')).toBe(
      'accept',
    );

    // Move threshold above the 0.83 confidence -> instant review state, no new call.
    const slider = screen.getByRole('slider');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(slider, { target: { value: '0.95' } });

    expect(screen.getByTestId('result-card').getAttribute('data-decision')).toBe(
      'review',
    );
    expect(screen.getByText(/Revisar manualmente/i)).toBeInTheDocument();
    // predict was only called once (no re-request on slider move).
    expect(client.predict).toHaveBeenCalledTimes(1);
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

  it('shows the backend detail message when predict fails', async () => {
    vi.mocked(client.predict).mockRejectedValue(
      new ApiError('Arquivo corrompido.', 400),
    );
    const user = userEvent.setup();
    const { container } = render(<App />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile());
    await user.click(screen.getByRole('button', { name: 'Classificar' }));

    await waitFor(() => {
      expect(screen.getByText('Arquivo corrompido.')).toBeInTheDocument();
    });
  });

  it('renders model info in the footer', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('model-info-footer')).toBeInTheDocument();
    });
    expect(screen.getByText('XGBoost')).toBeInTheDocument();
    expect(screen.getByText('3 classes')).toBeInTheDocument();
  });
});
