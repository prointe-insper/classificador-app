import { defineConfig, devices } from '@playwright/test';

// E2E tests run against an already-running dev server (npm run dev) at :5173.
// We intentionally do NOT start servers here — CI wiring is handled separately.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  // Sobe o dev server automaticamente. A suíte e2e mocka todas as rotas /api,
  // então o backend não precisa estar rodando.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
