import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'peticao.txt');

const PREDICTION = {
  predicted_label: 'ICMS Declarado',
  confidence: 0.83,
  threshold: 0.5,
  needs_manual_review: false,
  decision_label: 'ICMS Declarado',
  probabilities: [
    { label: 'ICMS Declarado', probability: 0.83 },
    { label: 'IPVA', probability: 0.12 },
    { label: 'Outros Tributos Estaduais', probability: 0.05 },
  ],
  explanation: [
    { token: 'icms declarado', weight: 1.23 },
    { token: 'divida ativa', weight: 0.6 },
    { token: 'isento', weight: -0.4 },
  ],
  char_count: 512,
  ocr_used: false,
  source: 'text',
  model_id: 'pge-tfidf-xgboost-v1',
};

const LABELS = ['ICMS Declarado', 'IPVA', 'Outros Tributos Estaduais'];

// Mock every backend route so the e2e is self-contained against the frontend.
async function mockApi(page: Page) {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', model_loaded: true }),
    }),
  );
  await page.route('**/api/labels', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ labels: LABELS }),
    }),
  );
  await page.route('**/api/models', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          {
            id: 'pge-tfidf-xgboost-v1',
            name: 'PGE · TF-IDF + XGBoost (v1)',
            description: 'modelo padrão',
            is_default: true,
          },
        ],
        default_id: 'pge-tfidf-xgboost-v1',
      }),
    }),
  );
  await page.route('**/api/model-info', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        model_type: 'XGBoost',
        target_column: 'assunto',
        n_documents: 5000,
        n_features: 2048,
        label_names: LABELS,
        class_distribution: {
          'ICMS Declarado': 2000,
          IPVA: 1500,
          'Outros Tributos Estaduais': 1500,
        },
      }),
    }),
  );
  await page.route('**/api/predict', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(PREDICTION),
    }),
  );
  await page.route('**/api/export-xlsx', (route) =>
    route.fulfill({
      status: 200,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      headers: {
        'Content-Disposition':
          'attachment; filename="classificacoes_20260616_120000.xlsx"',
        'X-Filename': 'classificacoes_20260616_120000.xlsx',
      },
      body: 'PK fake-xlsx',
    }),
  );
}

test('batch flow: classify, review threshold, feedback and export', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Classificador de Assuntos Jurídicos' }),
  ).toBeVisible();

  // Model selector is present and defaulted.
  await expect(page.getByTestId('model-select')).toHaveValue(
    'pge-tfidf-xgboost-v1',
  );

  // Upload the fixture file and classify.
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: /Classificar/ }).click();

  // Results table renders one row with the predicted label.
  const row = page.getByTestId('results-row');
  await expect(row).toHaveCount(1);
  await expect(row.getByText('ICMS Declarado')).toBeVisible();

  // Review badge starts as "Não" (0.83 >= 0.5).
  await expect(page.getByTestId('review-badge')).toHaveText('Não');

  // Move the threshold above the confidence -> badge flips to "Sim".
  const slider = page.getByRole('slider');
  await slider.evaluate((el) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, '0.95');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByTestId('review-badge')).toHaveText('Sim');

  // Expand details: probability bars and explanation chips appear.
  await page.getByTestId('toggle-details').click();
  await expect(page.getByTestId('prob-bar')).toHaveCount(3);
  await expect(page.getByTestId('explanation-chip')).toHaveCount(3);

  // Mark incorrect and pick the correct label.
  await page.getByTestId('feedback-incorrect').check();
  await page.getByTestId('feedback-correct-label').selectOption('IPVA');

  // Export to Excel triggers a download with a timestamped filename.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-button').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^classificacoes_.*\.xlsx$/);
});
