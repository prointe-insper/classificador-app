/**
 * Catálogo de modelos da versão no navegador.
 *
 * Espelha o `app/services/models.py` do backend, com os mesmos ids, para que um
 * resultado exportado daqui seja comparável com um exportado de lá. Os arquivos
 * são gerados por `backend/model/export_web.py`.
 */
export interface ModeloDisponivel {
  id: string;
  nome: string;
  descricao: string;
  arquivo: string;
  padrao?: boolean;
}

export const CATALOGO: ModeloDisponivel[] = [
  {
    id: 'pge-fixedchunks-tfidf-rf-v2',
    nome: 'PGE · TF-IDF + Random Forest (v2)',
    descricao:
      '16 assuntos da cauda da taxonomia (usucapião, IPTU, ITCMD, erro médico, ' +
      'terceirização e outros). Não tem as saídas "Outros" e "NÃO_NA_TAXONOMIA": ' +
      'o que sinaliza baixa aderência é a confiança.',
    arquivo: 'model-web.json',
    padrao: true,
  },
  {
    id: 'pge-tfidf-xgboost-v1',
    nome: 'PGE · TF-IDF + XGBoost (v1)',
    descricao:
      'Dez assuntos de massa (ICMS declarado e autuação, IPVA, GESS, ALE, ATS, ' +
      'bonificação, licença-prêmio, Detran/AIT) mais "Outros" e "NÃO_NA_TAXONOMIA".',
    arquivo: 'model-web-v1.json',
  },
];

export const MODELO_PADRAO =
  CATALOGO.find((m) => m.padrao)?.id ?? CATALOGO[0].id;
