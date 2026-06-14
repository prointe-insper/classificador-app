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
};

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
      body: JSON.stringify({
        labels: ['ICMS Declarado', 'IPVA', 'Outros Tributos Estaduais'],
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
        label_names: ['ICMS Declarado', 'IPVA', 'Outros Tributos Estaduais'],
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
}

test('happy path: classify, view results, then move threshold to trigger review', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Classificador de Assuntos Jurídicos' }),
  ).toBeVisible();

  // Upload the fixture file via the hidden input.
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByText('peticao.txt')).toBeVisible();

  // Submit.
  await page.getByRole('button', { name: 'Classificar' }).click();

  // Decision card shows the predicted class (accept state).
  const card = page.getByTestId('result-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-decision', 'accept');
  await expect(card.getByText('ICMS Declarado').first()).toBeVisible();

  // Probability bars render (one per label).
  await expect(page.getByTestId('prob-bar')).toHaveCount(3);

  // Explanation chips render.
  await expect(page.getByTestId('explanation-chip')).toHaveCount(3);

  // Move the threshold above the confidence (0.83) -> "Revisar manualmente".
  const slider = page.getByRole('slider');
  // Set value directly and dispatch the input/change events React listens to.
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

  await expect(card).toHaveAttribute('data-decision', 'review');
  await expect(page.getByText('Revisar manualmente')).toBeVisible();
});
