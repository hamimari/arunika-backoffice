import { defineConfig, devices } from '@playwright/test'

// Runs against the backend repo's docker-compose E2E stack
// (`make e2e-hold` in arunika-backend): backoffice on :3010, API on :8090.
export default defineConfig({
  testDir: './e2e',
  // Specs share one database and one admin account; run them one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'reports/e2e-junit.xml' }]]
    : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3010',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], headless: true } }],
})
