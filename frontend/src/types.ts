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
  /** Identificador do modelo que gerou a predição. */
  model_id: string;
}

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
}

export interface ModelsResponse {
  models: ModelOption[];
  default_id: string;
}

/** Avaliação humana de uma predição na tabela de resultados. */
export type FeedbackStatus = 'correto' | 'incorreto' | null;

export interface Feedback {
  status: FeedbackStatus;
  /** Rótulo correto informado quando a predição foi marcada como incorreta. */
  correctLabel: string | null;
}

export type BatchItemStatus = 'pending' | 'running' | 'done' | 'error';

/** Estado de um documento dentro do lote de classificação. */
export interface BatchItem {
  id: string;
  file: File;
  status: BatchItemStatus;
  result: PredictionResponse | null;
  error: string | null;
  feedback: Feedback;
}

/** Uma linha enviada ao backend para gerar a planilha XLSX. */
export interface ExportRow {
  document: string;
  predicted_label: string;
  confidence: number;
  threshold: number;
  needs_manual_review: boolean;
  decision_label: string;
  source: string;
  ocr_used: boolean;
  char_count: number;
  model_id: string;
  feedback_status: FeedbackStatus;
  correct_label: string | null;
  error: string | null;
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
