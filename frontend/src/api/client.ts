import {
  ApiError,
  type ApiErrorBody,
  type HealthResponse,
  type LabelsResponse,
  type ModelInfoResponse,
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

/**
 * POST /api/predict — multipart/form-data with the uploaded file and an
 * optional confidence threshold (0..1).
 */
export async function predict(
  file: File,
  threshold?: number,
): Promise<PredictionResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (threshold !== undefined) {
    formData.append('threshold', String(threshold));
  }

  const response = await fetch(`${BASE_PATH}/predict`, {
    method: 'POST',
    body: formData,
  });
  return parseJson<PredictionResponse>(response);
}
