import { useEffect, useMemo, useRef, useState } from 'react';

import { CATALOGO, MODELO_PADRAO } from './catalog';
import { loadModel } from './model/loader';
import { predict } from './model/predict';
import type { Prediction, WebModel } from './model/types';
import { extractText } from './utils/pdf';
import { expandZip, isZip } from './utils/zip';

const THRESHOLD_PADRAO = 0.5;
const REVISAR = 'Revisar manualmente';

interface Linha {
  nome: string;
  resultado?: Prediction;
  erro?: string;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1).replace('.', ',')}%`;
}

function baixarCsv(linhas: Linha[], limiar: number): void {
  const cabecalho = ['documento', 'rotulo_predito', 'confianca', 'revisar_manual', 'erro'];
  const corpo = linhas.map((l) => {
    const revisar = l.resultado ? (l.resultado.confidence < limiar ? 'sim' : 'nao') : '';
    return [
      l.nome,
      l.resultado?.label ?? '',
      l.resultado ? l.resultado.confidence.toFixed(4).replace('.', ',') : '',
      revisar,
      l.erro ?? '',
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(';');
  });
  // BOM na frente para o Excel abrir os acentos corretamente.
  const csv = `﻿${[cabecalho.join(';'), ...corpo].join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'classificacoes.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [modeloId, setModeloId] = useState(MODELO_PADRAO);
  const [model, setModel] = useState<WebModel | null>(null);
  const [carregandoModelo, setCarregandoModelo] = useState(true);
  // Cada modelo é baixado uma vez e fica em memória: trocar de ida e volta no
  // seletor não deve rebaixar 1-2 MB a cada troca.
  const cache = useRef(new Map<string, WebModel>());
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [limiar, setLimiar] = useState(THRESHOLD_PADRAO);
  const [aberta, setAberta] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const escolhido = useMemo(
    () => CATALOGO.find((m) => m.id === modeloId) ?? CATALOGO[0],
    [modeloId],
  );

  useEffect(() => {
    let cancelado = false;
    const guardado = cache.current.get(escolhido.id);
    if (guardado) {
      setModel(guardado);
      setCarregandoModelo(false);
      return;
    }
    setCarregandoModelo(true);
    setModel(null);
    loadModel(`${import.meta.env.BASE_URL}${escolhido.arquivo}`, escolhido.id)
      .then((m) => {
        cache.current.set(escolhido.id, m);
        if (!cancelado) {
          setModel(m);
        }
      })
      .catch((e) => {
        if (!cancelado) {
          setErro(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCarregandoModelo(false);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [escolhido]);

  async function classificar(entrada: FileList | null) {
    if (!entrada || !model) {
      return;
    }
    setErro(null);
    let arquivos = Array.from(entrada);
    try {
      const expandidos: File[] = [];
      for (const f of arquivos) {
        if (isZip(f)) {
          expandidos.push(...(await expandZip(f)).files);
        } else {
          expandidos.push(f);
        }
      }
      arquivos = expandidos;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o zip.');
      return;
    }

    setRodando(true);
    setAberta(null);
    setLinhas([]);
    setProgresso({ feitos: 0, total: arquivos.length });
    const saida: Linha[] = [];
    for (const arquivo of arquivos) {
      try {
        const texto = await extractText(arquivo, setStatus);
        saida.push({ nome: arquivo.name, resultado: predict(texto, model) });
      } catch (e) {
        saida.push({
          nome: arquivo.name,
          erro: e instanceof Error ? e.message : 'Falha ao ler o arquivo.',
        });
      }
      setStatus(null);
      setLinhas([...saida]);
      setProgresso({ feitos: saida.length, total: arquivos.length });
      // Devolve o controle ao navegador para a barra de progresso andar.
      await new Promise((r) => setTimeout(r, 0));
    }
    setStatus(null);
    setRodando(false);
  }

  const classificados = useMemo(() => linhas.filter((l) => l.resultado), [linhas]);

  return (
    <div className="app">
      <header className="header">
        <div className="header__inner">
          <span className="header__mark" aria-hidden="true">PGE</span>
          <div className="header__titles">
            <h1>Classificador de Assuntos Jurídicos</h1>
            <p className="header__subtitle">
              <strong>PGE-SP</strong> · Insper, versão que roda inteira no navegador
            </p>
          </div>
        </div>
      </header>

      <main className="app__main">
        <div className="layout">
          <div className="stack">
            <section className="card">
              <h2 className="card__title">Modelo de classificação</h2>
              <div className="model-selector">
                <label className="model-selector__label" htmlFor="modelo">
                  Modelo
                </label>
                <select
                  id="modelo"
                  className="model-selector__select"
                  data-testid="model-select"
                  value={modeloId}
                  disabled={rodando}
                  onChange={(e) => setModeloId(e.target.value)}
                >
                  {CATALOGO.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
                <p className="card__caption">{escolhido.descricao}</p>
                {model ? (
                  <p className="card__caption">
                    {model.labels.length} assuntos ·{' '}
                    {model.terms.length.toLocaleString('pt-BR')} atributos
                  </p>
                ) : null}
              </div>
            </section>

            <section className="card">
              <h2 className="card__title">Como esta versão funciona</h2>
              <p className="card__caption">
                O modelo é baixado uma vez (1,2 MB) e a classificação acontece no seu
                próprio navegador. <strong>Nenhum documento sai da sua máquina</strong>:
                não há servidor nem upload. Funciona offline depois do primeiro acesso.
              </p>
              <p className="card__caption">
                Lê <code>.txt</code>, PDF e imagem. PDF digitalizado, sem camada de
                texto, passa por <strong>OCR no próprio navegador</strong> (tesseract em
                WebAssembly). O modelo de português do OCR é baixado na primeira vez que
                for necessário; o documento continua sem sair daqui.
              </p>
            </section>

            <section className="card">
              <h2 className="card__title">1 · Documentos</h2>
              <div
                className="upload__dropzone"
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void classificar(e.dataTransfer.files);
                }}
              >
                <span className="upload__icon" aria-hidden="true">📄</span>
                <span>
                  Arraste os arquivos aqui ou <strong>clique para selecionar</strong>
                </span>
                <span className="upload__hint">
                  TXT, PDF, imagem ou um .zip com o lote
                </span>
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="visually-hidden"
                accept=".txt,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,.zip"
                disabled={!model || rodando}
                onChange={(e) => {
                  void classificar(e.target.files);
                  e.target.value = '';
                }}
              />
              {carregandoModelo ? (
                <p className="upload__status" role="status">Baixando o modelo...</p>
              ) : null}
              {rodando ? (
                <>
                  <p className="upload__status" role="status">
                    {status ?? `Classificando ${progresso.feitos} de ${progresso.total}...`}
                  </p>
                  <div
                    className="progress__track upload__progress"
                    role="progressbar"
                    aria-label="Progresso da classificação"
                    aria-valuenow={progresso.feitos}
                    aria-valuemin={0}
                    aria-valuemax={progresso.total}
                  >
                    <div
                      className="progress__fill"
                      style={{
                        width: `${
                          progresso.total > 0
                            ? (progresso.feitos / progresso.total) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </>
              ) : null}
            </section>

            <section className="card">
              <div className="threshold__head">
                <span>Limiar de confiança</span>
                <span className="threshold__value" aria-hidden="true">{pct(limiar)}</span>
              </div>
              <input
                type="range"
                className="threshold__slider"
                min={0}
                max={1}
                step={0.01}
                value={limiar}
                aria-label="Limiar de confiança"
                onChange={(e) => setLimiar(Number(e.target.value))}
              />
            </section>
          </div>

          <div className="stack">
            {erro ? <p className="results-table__error" role="alert">{erro}</p> : null}

            {linhas.length > 0 ? (
              <section className="card">
                <div className="results__head">
                  <h2 className="card__title">Resultados ({linhas.length})</h2>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={classificados.length === 0}
                    onClick={() => baixarCsv(linhas, limiar)}
                  >
                    Baixar CSV
                  </button>
                </div>

                <div className="results__scroll">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>Documento</th>
                        <th>Rótulo predito</th>
                        <th>Confiança</th>
                        <th>Revisar manual</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((linha, i) => {
                        const revisar = linha.resultado
                          ? linha.resultado.confidence < limiar
                          : false;
                        return (
                          <tr key={`${linha.nome}-${i}`}>
                            <td>{linha.nome}</td>
                            <td>
                              {linha.erro
                                ? linha.erro
                                : revisar
                                  ? REVISAR
                                  : linha.resultado?.label}
                            </td>
                            <td>{linha.resultado ? pct(linha.resultado.confidence) : '-'}</td>
                            <td>{linha.resultado ? (revisar ? 'Sim' : 'Não') : '-'}</td>
                            <td>
                              {linha.resultado ? (
                                <button
                                  type="button"
                                  className="btn btn--link"
                                  onClick={() => setAberta(aberta === i ? null : i)}
                                >
                                  {aberta === i ? 'Ocultar' : 'Detalhes'}
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {aberta !== null && linhas[aberta]?.resultado ? (
              <Detalhes resultado={linhas[aberta].resultado as Prediction} />
            ) : null}
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <span>© 2026 PGE-SP · Insper, Classificador de Assuntos Jurídicos</span>
          {model ? (
            <div className="footer__meta">
              <span>
                Modelo: <strong>{model.modelType}</strong>
              </span>
              <span>{model.labels.length} classes</span>
              <span>{model.terms.length.toLocaleString('pt-BR')} atributos</span>
              <span>{model.forest.nTrees} árvores</span>
            </div>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function Detalhes({ resultado }: { resultado: Prediction }) {
  const maior = resultado.explanation[0]?.weight ?? 0;
  return (
    <>
      <section className="card">
        <h2 className="card__title">Probabilidades por classe</h2>
        <div className="bars">
          {resultado.probabilities.map((p, i) => (
            <div className={`bar${i === 0 ? ' bar--top' : ''}`} key={p.label}>
              <span className="bar__label">{p.label}</span>
              <span className="bar__pct">{pct(p.probability)}</span>
              <div className="bar__track">
                <div className="bar__fill" style={{ width: `${p.probability * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">Termos mais influentes</h2>
        <p className="card__caption">
          O peso combina a frequência do termo no documento com a importância dele para
          o modelo, então mede <strong>influência</strong>, não direção a favor ou
          contra a classe. O número é relativo ao termo mais influente do documento.
        </p>
        <div className="chips">
          {resultado.explanation.map((e) => (
            <span className="chip chip--positive" key={e.token}>
              {e.token}
              <span className="chip__weight">
                {maior > 0 ? Math.round((e.weight / maior) * 100) : 0}%
              </span>
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
