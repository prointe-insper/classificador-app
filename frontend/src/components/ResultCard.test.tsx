import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultCard } from './ResultCard';
import type { PredictionResponse } from '../types';

const RESULT: PredictionResponse = {
  predicted_label: 'ICMS Declarado',
  confidence: 0.6,
  threshold: 0.5,
  needs_manual_review: false,
  decision_label: 'ICMS Declarado',
  probabilities: [{ label: 'ICMS Declarado', probability: 0.6 }],
  explanation: [],
  char_count: 1234,
  ocr_used: false,
  source: 'pdf',
  model_id: 'pge-tfidf-xgboost-v1',
};

describe('ResultCard', () => {
  it('shows the predicted class when confidence >= threshold', () => {
    render(<ResultCard result={RESULT} threshold={0.5} />);
    const card = screen.getByTestId('result-card');
    expect(card.getAttribute('data-decision')).toBe('accept');
    expect(screen.getByText('ICMS Declarado')).toBeInTheDocument();
    expect(screen.queryByText(/Revisar manualmente/i)).not.toBeInTheDocument();
  });

  it('shows the manual review warning when confidence < threshold', () => {
    render(<ResultCard result={RESULT} threshold={0.8} />);
    const card = screen.getByTestId('result-card');
    expect(card.getAttribute('data-decision')).toBe('review');
    expect(screen.getByText(/Revisar manualmente/i)).toBeInTheDocument();
    // Predicted label still shown even in review state.
    expect(screen.getByText('ICMS Declarado')).toBeInTheDocument();
  });

  it('recomputes the decision instantly when the threshold prop changes', () => {
    const { rerender } = render(<ResultCard result={RESULT} threshold={0.5} />);
    expect(screen.getByTestId('result-card').getAttribute('data-decision')).toBe(
      'accept',
    );

    rerender(<ResultCard result={RESULT} threshold={0.7} />);
    expect(screen.getByTestId('result-card').getAttribute('data-decision')).toBe(
      'review',
    );

    rerender(<ResultCard result={RESULT} threshold={0.4} />);
    expect(screen.getByTestId('result-card').getAttribute('data-decision')).toBe(
      'accept',
    );
  });

  it('renders the metadata line', () => {
    render(<ResultCard result={RESULT} threshold={0.5} />);
    expect(screen.getByText(/caracteres extraídos/i)).toBeInTheDocument();
    expect(screen.getByText(/OCR:/i)).toBeInTheDocument();
  });
});
