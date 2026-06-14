import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLabels, getModelInfo, predict } from './client';
import { ApiError, type PredictionResponse } from '../types';

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

  it('omits threshold from FormData when not provided', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(PREDICTION));

    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    await predict(file);

    const body = vi.mocked(fetch).mock.calls[0][1]?.body as FormData;
    expect(body.has('threshold')).toBe(false);
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
});
