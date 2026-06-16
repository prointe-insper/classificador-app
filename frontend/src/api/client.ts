import {
  ApiError,
  type ApiErrorBody,
  type ExportRow,
  type HealthResponse,
  type LabelsResponse,
  type ModelInfoResponse,
  type ModelsResponse,
  type PredictionResponse,
} from '../types';

const BASE_PATH = '/api';

/**
 * Reads a backend error body and produces an ApiError carrying its `detail`
 * message (or a sensible fallback based on the HTTP status).
 */
async function toApiError(response: Response): Promise<ApiError> {
  let detail: string | undefined;
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body && typeof body.detail === 'string') {
      detail = body.detail;
    }
  } catch {
    // Body was not JSON; fall through to the generic message.
  }
  const message =
    detail ?? `Erro ${response.status}: não foi possível concluir a requisição.`;
  return new ApiError(message, response.status);
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

/** GET /api/health */
export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${BASE_PATH}/health`);
  return parseJson<HealthResponse>(response);
}

/** GET /api/labels */
export async function getLabels(): Promise<LabelsResponse> {
  const response = await fetch(`${BASE_PATH}/labels`);
  return parseJson<LabelsResponse>(response);
}

/** GET /api/model-info */
export async function getModelInfo(): Promise<ModelInfoResponse> {
  const response = await fetch(`${BASE_PATH}/model-info`);
  return parseJson<ModelInfoResponse>(response);
}

/** GET /api/models — lista de modelos disponíveis para seleção. */
export async function getModels(): Promise<ModelsResponse> {
  const response = await fetch(`${BASE_PATH}/models`);
  return parseJson<ModelsResponse>(response);
}

/**
 * POST /api/predict — multipart/form-data with the uploaded file and an
 * optional confidence threshold (0..1).
 */
export async function predict(
  file: File,
  threshold?: number,
  modelId?: string,
): Promise<PredictionResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (threshold !== undefined) {
    formData.append('threshold', String(threshold));
  }
  if (modelId !== undefined && modelId !== '') {
    formData.append('model_id', modelId);
  }

  const response = await fetch(`${BASE_PATH}/predict`, {
    method: 'POST',
    body: formData,
  });
  return parseJson<PredictionResponse>(response);
}

/**
 * POST /api/export-xlsx — envia as linhas da tabela (com feedback) e devolve a
 * planilha como Blob, junto do nome de arquivo (com timestamp) sugerido pelo
 * backend via cabeçalho `X-Filename` / `Content-Disposition`.
 */
export async function exportXlsx(
  rows: ExportRow[],
  modelId?: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${BASE_PATH}/export-xlsx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, model_id: modelId ?? null }),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  const blob = await response.blob();
  return { blob, filename: filenameFromResponse(response) };
}

/** Extrai o nome do arquivo dos cabeçalhos, com fallback baseado em timestamp. */
function filenameFromResponse(response: Response): string {
  const header = response.headers.get('X-Filename');
  if (header) {
    return header;
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  if (match) {
    return match[1];
  }
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[-:T]/g, (c) => (c === 'T' ? '_' : ''));
  return `classificacoes_${stamp}.xlsx`;
}
