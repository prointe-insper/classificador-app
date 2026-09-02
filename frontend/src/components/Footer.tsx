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
            {/* Nem todo bundle traz o tamanho do corpus de treino (o do
                juriclass, por exemplo, não traz): melhor omitir a informação
                que exibir "0 documentos". */}
            {modelInfo.n_documents > 0 ? (
              <span>
                {modelInfo.n_documents.toLocaleString('pt-BR')} documentos
              </span>
            ) : null}
            <span>
              {modelInfo.n_features.toLocaleString('pt-BR')} atributos
            </span>
          </div>
        ) : null}
      </div>
    </footer>
  );
}
