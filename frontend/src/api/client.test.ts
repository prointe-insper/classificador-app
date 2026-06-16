import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportXlsx, getLabels, getModelInfo, getModels, predict } from './client';
import { ApiError, type ExportRow, type PredictionResponse } from '../types';

const PREDICTION: PredictionResponse = {
  predicted_label: 'ICMS Declarado',
  confidence: 0.83,
  threshold: 0.5,
  needs_manual_review: false,
  decision_label: 'ICMS Declarado',
  probabilities: [
    { label: 'ICMS Declarado', probability: 0.83 },
    { label: 'Outro', probability: 0.17 },
  ],
  explanation: [{ token: 'icms declarado', weight: 1.23 }],
  char_count: 1234,
  ocr_used: false,
  source: 'pdf',
  model_id: 'pge-tfidf-xgboost-v1',
};

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts FormData with file and threshold to /api/predict and parses the response', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(PREDICTION));

    const file = new File(['conteúdo'], 'peticao.txt', { type: 'text/plain' });
    const result = await predict(file, 0.7);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/predict');
    expect(init?.method).toBe('POST');

    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBe(file);
    expect(body.get('threshold')).toBe('0.7');

    expect(result).toEqual(PREDICTION);
  });

  it('omits threshold and model_id from FormData when not provided', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(PREDICTION));

    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    await predict(file);

    const body = vi.mocked(fetch).mock.calls[0][1]?.body as FormData;
    expect(body.has('threshold')).toBe(false);
    expect(body.has('model_id')).toBe(false);
  });

  it('includes model_id in FormData when provided', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(PREDICTION));

    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    await predict(file, 0.5, 'pge-tfidf-xgboost-v1');

    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body.get('model_id')).toBe('pge-tfidf-xgboost-v1');
  });

  it('getModels parses the model list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        models: [
          { id: 'm1', name: 'Modelo 1', description: 'd', is_default: true },
        ],
        default_id: 'm1',
      }),
    );
    const result = await getModels();
    expect(result.default_id).toBe('m1');
    expect(result.models).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/models');
  });

  it('throws ApiError with the backend detail message on non-ok responses', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ detail: 'Arquivo inválido.' }, { ok: false, status: 400 }),
    );

    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    await expect(predict(file, 0.5)).rejects.toMatchObject({
      message: 'Arquivo inválido.',
      status: 400,
    });
    await expect(
      predict(new File(['x'], 'a.txt'), 0.5),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('falls back to a generic message when the error body has no detail', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({}, { ok: false, status: 503 }),
    );

    await expect(getModelInfo()).rejects.toMatchObject({ status: 503 });
    await expect(getModelInfo()).rejects.toThrow(/503/);
  });

  it('getLabels parses the labels array', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ labels: ['A', 'B'] }),
    );
    const result = await getLabels();
    expect(result.labels).toEqual(['A', 'B']);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/labels');
  });

  it('exportXlsx posts rows as JSON and returns blob + filename from header', async () => {
    const blob = new Blob(['fake-xlsx'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'X-Filename': 'classificacoes_20260616_120000.xlsx' }),
      blob: () => Promise.resolve(blob),
    } as unknown as Response);

    const rows: ExportRow[] = [
      {
        document: 'a.pdf',
        predicted_label: 'ICMS Declarado',
        confidence: 0.9,
        threshold: 0.5,
        needs_manual_review: false,
        decision_label: 'ICMS Declarado',
        source: 'pdf',
        ocr_used: false,
        char_count: 10,
        model_id: 'm1',
        feedback_status: 'correto',
        correct_label: null,
        error: null,
      },
    ];
    const result = await exportXlsx(rows, 'm1');

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/export-xlsx');
    expect(init?.method).toBe('POST');
    const sent = JSON.parse(init?.body as string);
    expect(sent.rows).toHaveLength(1);
    expect(sent.model_id).toBe('m1');
    expect(result.filename).toBe('classificacoes_20260616_120000.xlsx');
    expect(result.blob).toBe(blob);
  });

  it('exportXlsx falls back to a timestamped filename without headers', async () => {
    const blob = new Blob(['x']);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      blob: () => Promise.resolve(blob),
    } as unknown as Response);

    const result = await exportXlsx([]);
    expect(result.filename).toMatch(/^classificacoes_.*\.xlsx$/);
  });
});
