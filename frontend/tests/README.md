# Testes

Os testes unitários (Vitest + React Testing Library) ficam **co-localizados**
com o código em `src/**/*.test.{ts,tsx}`:

- `src/api/client.test.ts`
- `src/components/ProbabilityBars.test.tsx`
- `src/components/Explanation.test.tsx`
- `src/components/ThresholdControl.test.tsx`
- `src/components/ResultCard.test.tsx`
- `src/components/FileUpload.test.tsx`
- `src/App.test.tsx`

Os testes end-to-end (Playwright) ficam em `e2e/`.

Rode com:

```bash
npm run test        # unitários (vitest run)
npm run test:watch  # unitários em watch
npm run e2e         # end-to-end (Playwright) — requer o dev server em :5173
```

Esta pasta `tests/` é mantida apenas como referência.
