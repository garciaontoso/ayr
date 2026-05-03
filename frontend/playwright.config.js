import { defineConfig, devices } from '@playwright/test';

// E2E config — Semana 10 del roadmap profesionalización (docs/ROADMAP-PRO.md).
// Adelantada para servir de safety net antes de refactorizar monolitos.
//
// Uso:
//   - Local contra dev server:        npm run e2e
//   - Local con UI (debug):           npm run e2e:ui
//   - Local con browser visible:      npm run e2e:headed
//   - CI contra producción:           E2E_URL=https://ayr.onto-so.com npm run e2e
//
// Auth: el flujo se hace inyectando el timestamp `ayr_auth` en localStorage
// (ver e2e/_setup/auth.js). NO necesitamos password real porque AuthGate sólo
// comprueba que el timestamp esté dentro de 15 min.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 8_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Dev server auto-arranca local; en CI corre directo contra producción
  // así que webServer queda undefined.
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
