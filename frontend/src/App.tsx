import { useEffect, useState } from 'react';
import { exportXlsx, getHealth, getModelInfo, getModels, predict } from './api/client';
import {
  ApiError,
  type BatchItem,
  type Feedback,
  type ModelInfoResponse,
  type ModelOption,
} from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ModelSelector } from './components/ModelSelector';
import { MultiFileUpload } from './components/MultiFileUpload';
import { ThresholdControl } from './components/ThresholdControl';
import { ProgressBar } from './components/ProgressBar';
import { ResultsTable } from './components/ResultsTable';
import { InfoBanner } from './components/InfoBanner';
import { buildExportRows, triggerDownload } from './utils/export';

const DEFAULT_THRESHOLD = 0.5;

interface Progress {
  done: number;
  total: number;
  current: string | null;
}

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>({
    done: 0,
    total: 0,
    current: null,
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);
  const [modelNotLoaded, setModelNotLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const health = await getHealth();
        if (!cancelled && !health.model_loaded) {
          setModelNotLoaded(true);
        }
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.status === 503) {
          setModelNotLoaded(true);
        }
      }

      try {
        const info = await getModelInfo();
        if (!cancelled) {
          setModelInfo(info);
        }
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.status === 503) {
          setModelNotLoaded(true);
        }
      }

      try {
        const list = await getModels();
        if (!cancelled) {
          setModels(list.models);
          setSelectedModelId(list.default_id);
        }
      } catch {
        // Sem a lista de modelos, o seletor fica vazio; predição usa o padrão.
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleFilesChange(next: File[]) {
    setFiles(next);
    setError(null);
  }

  function handleFeedbackChange(id: string, feedback: Feedback) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, feedback } : item)),
    );
  }

  async function handleSubmit() {
    if (files.length === 0 || running) {
      return;
    }
    setRunning(true);
    setError(null);

    const working: BatchItem[] = files.map((file, i) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${i}`,
      file,
      status: 'pending',
      result: null,
      error: null,
      feedback: { status: null, correctLabel: null },
    }));
    setItems(working.map((item) => ({ ...item })));
    setProgress({ done: 0, total: working.length, current: null });

    for (let i = 0; i < working.length; i += 1) {
      working[i] = { ...working[i], status: 'running' };
      setItems(working.map((item) => ({ ...item })));
      setProgress((p) => ({ ...p, current: working[i].file.name }));

      try {
        const result = await predict(working[i].file, threshold, selectedModelId);
        working[i] = { ...working[i], status: 'done', result };
        setModelNotLoaded(false);
      } catch (err) {
        let message = 'Falha de comunicação com o servidor. Verifique sua conexão.';
        if (err instanceof ApiError) {
          message = err.message;
          if (err.status === 503) {
            setModelNotLoaded(true);
          }
        }
        working[i] = { ...working[i], status: 'error', error: message };
      }

      setItems(working.map((item) => ({ ...item })));
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setProgress((p) => ({ ...p, current: null }));
    setRunning(false);
  }

  async function handleExport() {
    if (items.length === 0) {
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const rows = buildExportRows(items, threshold);
      const { blob, filename } = await exportXlsx(rows, selectedModelId);
      triggerDownload(blob, filename);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Falha ao gerar a planilha de classificações.',
      );
    } finally {
      setExporting(false);
    }
  }

  const labels = modelInfo?.label_names ?? [];
  const hasResults = items.length > 0;

  return (
    <div className="app">
      <Header />

      <main className="app__main">
        {modelNotLoaded ? (
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <InfoBanner variant="warning" title="Modelo indisponível">
              O modelo de classificação ainda não foi carregado no servidor
              (HTTP 503). A classificação ficará indisponível até que o serviço
              esteja pronto.
            </InfoBanner>
          </div>
        ) : null}

        <div className="layout">
          <div className="stack">
            <ModelSelector
              models={models}
              value={selectedModelId}
              onChange={setSelectedModelId}
              disabled={running}
            />
            <MultiFileUpload
              files={files}
              onFilesChange={handleFilesChange}
              onSubmit={handleSubmit}
              loading={running}
              onError={setError}
            />
            <ThresholdControl value={threshold} onChange={setThreshold} />
          </div>

          <div className="stack">
            {error ? (
              <InfoBanner variant="error" title="Erro">
                {error}
              </InfoBanner>
            ) : null}

            {running ? (
              <ProgressBar
                done={progress.done}
                total={progress.total}
                current={progress.current}
              />
            ) : null}

            {hasResults ? (
              <ResultsTable
                items={items}
                labels={labels}
                threshold={threshold}
                onFeedbackChange={handleFeedbackChange}
                onExport={handleExport}
                exporting={exporting}
              />
            ) : !running ? (
              <section className="card">
                <div className="placeholder">
                  <span className="placeholder__icon" aria-hidden="true">
                    ⚖️
                  </span>
                  <p>
                    Envie uma ou mais petições (TXT, PDF ou imagem) e clique em{' '}
                    <strong>Classificar</strong>. Os resultados aparecem em uma
                    tabela com a classe prevista, a confiança e a opção de revisar
                    e exportar para Excel.
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </main>

      <Footer modelInfo={modelInfo} />
    </div>
  );
}
