import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultsTable } from './ResultsTable';
import type { BatchItem, PredictionResponse } from '../types';

const LABELS = ['ICMS Declarado', 'IPVA', 'Servidor'];

function result(over: Partial<PredictionResponse> = {}): PredictionResponse {
  return {
    predicted_label: 'ICMS Declarado',
    confidence: 0.83,
    threshold: 0.5,
    needs_manual_review: false,
    decision_label: 'ICMS Declarado',
    probabilities: [
      { label: 'ICMS Declarado', probability: 0.83 },
      { label: 'IPVA', probability: 0.17 },
    ],
    explanation: [{ token: 'icms', weight: 1.0 }],
    char_count: 100,
    ocr_used: false,
    source: 'pdf',
    model_id: 'm1',
    ...over,
  };
}

function doneItem(id: string, name: string, conf = 0.83): BatchItem {
  return {
    id,
    file: new File(['x'], name),
    status: 'done',
    result: result({ confidence: conf }),
    error: null,
    feedback: { status: null, correctLabel: null },
  };
}

function renderTable(items: BatchItem[], extra: Partial<Parameters<typeof ResultsTable>[0]> = {}) {
  const onFeedbackChange = vi.fn();
  const onExport = vi.fn();
  render(
    <ResultsTable
      items={items}
      labels={LABELS}
      threshold={0.5}
      onFeedbackChange={onFeedbackChange}
      onExport={onExport}
      exporting={false}
      {...extra}
    />,
  );
  return { onFeedbackChange, onExport };
}

describe('ResultsTable', () => {
  it('renders a row per item with label and confidence', () => {
    renderTable([doneItem('1', 'a.pdf'), doneItem('2', 'b.pdf')]);
    const rows = screen.getAllByTestId('results-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('a.pdf')).toBeInTheDocument();
    expect(within(rows[0]).getByText('83,0%')).toBeInTheDocument();
  });

  it('flags manual review when confidence is below the threshold', () => {
    renderTable([doneItem('1', 'low.pdf', 0.3)], { threshold: 0.5 });
    expect(screen.getByTestId('review-badge')).toHaveTextContent('Sim');
  });

  it('does not flag review when confidence meets the threshold', () => {
    renderTable([doneItem('1', 'high.pdf', 0.9)], { threshold: 0.5 });
    expect(screen.getByTestId('review-badge')).toHaveTextContent('Não');
  });

  it('calls onFeedbackChange when marking correct/incorrect', async () => {
    const user = userEvent.setup();
    const { onFeedbackChange } = renderTable([doneItem('1', 'a.pdf')]);

    await user.click(screen.getByTestId('feedback-correct'));
    expect(onFeedbackChange).toHaveBeenCalledWith('1', {
      status: 'correto',
      correctLabel: null,
    });
  });

  it('shows the correct-label dropdown only after marking incorrect', () => {
    const incorrect: BatchItem = {
      ...doneItem('1', 'a.pdf'),
      feedback: { status: 'incorreto', correctLabel: null },
    };
    renderTable([incorrect]);
    const dropdown = screen.getByTestId('feedback-correct-label');
    expect(within(dropdown).getByRole('option', { name: 'Servidor' })).toBeInTheDocument();
  });

  it('expands a row to show the detail (probabilities + explanation)', async () => {
    const user = userEvent.setup();
    renderTable([doneItem('1', 'a.pdf')]);

    expect(screen.queryByTestId('results-detail')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('toggle-details'));
    expect(screen.getByTestId('results-detail')).toBeInTheDocument();
    expect(screen.getByTestId('result-card')).toBeInTheDocument();
  });

  it('disables export while exporting and triggers onExport otherwise', async () => {
    const user = userEvent.setup();
    const { onExport } = renderTable([doneItem('1', 'a.pdf')]);
    await user.click(screen.getByTestId('export-button'));
    expect(onExport).toHaveBeenCalled();
  });

  it('renders error and pending states', () => {
    const items: BatchItem[] = [
      {
        id: 'e',
        file: new File(['x'], 'err.pdf'),
        status: 'error',
        result: null,
        error: 'Falhou',
        feedback: { status: null, correctLabel: null },
      },
      {
        id: 'p',
        file: new File(['x'], 'pend.pdf'),
        status: 'running',
        result: null,
        error: null,
        feedback: { status: null, correctLabel: null },
      },
    ];
    renderTable(items);
    expect(screen.getByText(/Falhou/)).toBeInTheDocument();
    expect(screen.getByText(/Classificando…/)).toBeInTheDocument();
  });
});
