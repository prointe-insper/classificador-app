// Shared TypeScript types mirroring the backend API contract.

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
}

export interface LabelsResponse {
  labels: string[];
}

export interface ModelInfoResponse {
  model_type: string;
  target_column: string;
  n_documents: number;
  n_features: number;
  label_names: string[];
  class_distribution: Record<string, number>;
}

export interface ProbabilityItem {
  label: string;
  probability: number;
}

export interface ExplanationItem {
  token: string;
  weight: number;
}

export type PredictionSource = 'text' | 'pdf' | 'pdf+ocr' | 'image';

export interface PredictionResponse {
  predicted_label: string;
  confidence: number;
  threshold: number;
  needs_manual_review: boolean;
  /** Either the predicted label or "Revisar manualmente". */
  decision_label: string;
  /** Sorted descending by probability. */
  probabilities: ProbabilityItem[];
  /** Signed weights; abs(weight) = importance; positive pushes toward the class. */
  explanation: ExplanationItem[];
  char_count: number;
  ocr_used: boolean;
  source: PredictionSource;
}

/** Shape of backend error bodies: { "detail": "..." }. */
export interface ApiErrorBody {
  detail?: string;
}

/** Thrown by the API client on non-ok responses; carries the backend `detail`. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
