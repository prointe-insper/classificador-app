import { useEffect, useState } from 'react';
import { getHealth, getModelInfo, predict } from './api/client';
import { ApiError, type ModelInfoResponse, type PredictionResponse } from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { FileUpload } from './components/FileUpload';
import { ThresholdControl } from './components/ThresholdControl';
import { ResultCard } from './components/ResultCard';
import { ProbabilityBars } from './components/ProbabilityBars';
import { Explanation } from './components/Explanation';
import { InfoBanner } from './components/InfoBanner';

const DEFAULT_THRESHOLD = 0.5;

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResponse | null>(null);

  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);
  const [modelNotLoaded, setModelNotLoaded] = useState(false);

  // On mount: probe health + model info to surface the 503 / not-loaded state
  // and show subtle model metadata in the footer.
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
        // Other health errors are non-fatal for the UI; predict will surface them.
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
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleFileChange(next: File | null) {
    setFile(next);
    setError(null);
  }

  async function handleSubmit() {
    if (!file) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const prediction = await predict(file, threshold);
      setResult(prediction);
      setModelNotLoaded(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 503) {
          setModelNotLoaded(true);
        }
        setError(err.message);
      } else {
        setError('Falha de comunicação com o servidor. Verifique sua conexão.');
      }
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

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
            <FileUpload
              file={file}
              onFileChange={handleFileChange}
              onSubmit={handleSubmit}
              loading={loading}
            />
            <ThresholdControl value={threshold} onChange={setThreshold} />
          </div>

          <div className="stack">
            {error ? (
              <InfoBanner variant="error" title="Erro na classificação">
                {error}
              </InfoBanner>
            ) : null}

            {result ? (
              <>
                <ResultCard result={result} threshold={threshold} />
                <ProbabilityBars probabilities={result.probabilities} />
                <Explanation explanation={result.explanation} />
              </>
            ) : (
              <section className="card">
                <div className="placeholder">
                  <span className="placeholder__icon" aria-hidden="true">
                    ⚖️
                  </span>
                  <p>
                    Envie uma petição (TXT, PDF ou imagem) e clique em{' '}
                    <strong>Classificar</strong> para ver a classe prevista, as
                    probabilidades e os termos mais influentes.
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      <Footer modelInfo={modelInfo} />
    </div>
  );
}
