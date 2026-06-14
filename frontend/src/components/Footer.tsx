import type { ModelInfoResponse } from '../types';

interface FooterProps {
  modelInfo: ModelInfoResponse | null;
}

export function Footer({ modelInfo }: FooterProps) {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="footer__inner">
        <span>
          © {year} PGE-SP · Insper — Classificador de Assuntos Jurídicos
        </span>
        {modelInfo ? (
          <div className="footer__meta" data-testid="model-info-footer">
            <span>
              Modelo: <strong>{modelInfo.model_type}</strong>
            </span>
            <span>{modelInfo.label_names.length} classes</span>
            <span>
              {modelInfo.n_documents.toLocaleString('pt-BR')} documentos
            </span>
            <span>
              {modelInfo.n_features.toLocaleString('pt-BR')} atributos
            </span>
          </div>
        ) : null}
      </div>
    </footer>
  );
}
