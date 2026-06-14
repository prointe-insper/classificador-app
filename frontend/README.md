# Classificador de Assuntos Jurídicos — Frontend

Interface web (React + TypeScript + Vite) do **Classificador de Assuntos — PGE-SP**
(Procuradoria Geral do Estado de São Paulo + Insper).

O usuário envia uma petição (TXT, PDF ou imagem) e a aplicação exibe:

- a **classe de assunto prevista** (ou o estado "Revisar manualmente");
- as **probabilidades** de cada rótulo (gráfico de barras feito à mão);
- uma visão de **interpretabilidade** (termos mais influentes — TreeSHAP);
- um **limiar de confiança** ajustável que decide entre aceitar a classe ou marcar
  para revisão manual (recalculado no cliente instantaneamente ao mover o slider).

## Stack

- Vite + React 18 + TypeScript (modo estrito)
- CSS puro com variáveis (`src/styles/theme.css`) — sem Tailwind / libs de UI
- Vitest + React Testing Library (unitários)
- Playwright (e2e)

## Scripts

```bash
npm install          # instalar dependências (execute antes de tudo)
npm run dev          # servidor de desenvolvimento em http://localhost:5173
npm run build        # type-check (tsc) + build de produção
npm run preview      # pré-visualizar o build
npm run test         # testes unitários (vitest run)
npm run test:watch   # testes unitários em watch
npm run e2e          # testes end-to-end (Playwright)
```

> Para o Playwright, instale os navegadores uma vez: `npx playwright install chromium`.

## API / Proxy

O dev server faz proxy de `/api` → `http://localhost:8000` (configurado em
`vite.config.ts`). Suba o backend nessa porta para uso real. Os testes
unitários e e2e usam mocks e não dependem do backend.

## Estrutura

```
index.html
vite.config.ts            # dev server :5173, proxy /api, config do vitest
playwright.config.ts
src/
  main.tsx, App.tsx
  api/client.ts           # cliente tipado (predict, getLabels, getModelInfo, getHealth)
  types.ts                # tipos compartilhados + ApiError
  components/             # Header, FileUpload, ThresholdControl, ResultCard,
                          # ProbabilityBars, Explanation, Footer, InfoBanner
  utils/format.ts
  styles/theme.css, global.css
  setupTests.ts
  **/*.test.tsx           # testes unitários co-localizados
e2e/
  classify.spec.ts        # happy path com /api/* mockado via page.route
  fixtures/peticao.txt
```
