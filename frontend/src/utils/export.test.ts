import { describe, expect, it } from 'vitest';
import { buildExportRows, triggerDownload } from './export';
import type { BatchItem, PredictionResponse } from '../types';

function result(over: Partial<PredictionResponse> = {}): PredictionResponse {
  return {
    predicted_label: 'ICMS Declarado',
    confidence: 0.83,
    threshold: 0.5,
    needs_manual_review: false,
    decision_label: 'ICMS Declarado',
    probabilities: [],
    explanation: [],
    char_count: 100,
    ocr_used: false,
    source: 'pdf',
    model_id: 'm1',
    ...over,
  };
}

function item(over: Partial<BatchItem> = {}): BatchItem {
  return {
    id: '1',
    file: new File(['x'], 'a.pdf'),
    status: 'done',
    result: result(),
    error: null,
    feedback: { status: null, correctLabel: null },
    ...over,
  };
}

describe('buildExportRows', () => {
  it('maps a done item with feedback into an export row', () => {
    const rows = buildExportRows(
      [item({ feedback: { status: 'incorreto', correctLabel: 'IPVA' } })],
      0.5,
    );
    expect(rows[0]).toMatchObject({
      document: 'a.pdf',
      predicted_label: 'ICMS Declarado',
      confidence: 0.83,
      needs_manual_review: false,
      decision_label: 'ICMS Declarado',
      feedback_status: 'incorreto',
      correct_label: 'IPVA',
      model_id: 'm1',
    });
  });

  it('recomputes manual-review against the current threshold', () => {
    const rows = buildExportRows([item({ result: result({ confidence: 0.4 }) })], 0.5);
    expect(rows[0].needs_manual_review).toBe(true);
    expect(rows[0].decision_label).toBe('Revisar manualmente');
  });

  it('represents a failed item with an error and no prediction', () => {
    const rows = buildExportRows(
      [item({ status: 'error', result: null, error: 'boom' })],
      0.5,
    );
    expect(rows[0].predicted_label).toBe('');
    expect(rows[0].error).toBe('boom');
  });
});

describe('triggerDownload', () => {
  it('creates and revokes an object URL and clicks an anchor', () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const stubUrl = {
      createObjectURL: (b: Blob) => {
        void b;
        const u = `blob:${created.length}`;
        created.push(u);
        return u;
      },
      revokeObjectURL: (u: string) => revoked.push(u),
    };
    const realUrl = globalThis.URL;
    // @ts-expect-error - parcial para o teste
    globalThis.URL = stubUrl;

    let clicked = false;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicked = true;
    };

    triggerDownload(new Blob(['x']), 'arquivo.xlsx');

    expect(clicked).toBe(true);
    expect(created).toHaveLength(1);
    expect(revoked).toEqual(created);

    HTMLAnchorElement.prototype.click = origClick;
    globalThis.URL = realUrl;
  });
});
