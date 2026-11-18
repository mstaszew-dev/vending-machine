import { defineConfig } from '@playwright/test'

// End-to-end run against a real backend process (port 8091) and a real InfluxDB instance.
// Its own databases are recreated by scripts/e2e-server.sh, so the run is repeatable and
// does not touch the developer's monitoring data.
const PORT = Number(process.env.E2E_PORT ?? 8091)
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? 5174)

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The UI test uses the Chrome that is already installed, so CI-style browser
    // downloads are not needed for the API-level suite.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'bash scripts/e2e-server.sh',
      url: `http://127.0.0.1:${PORT}/health/ready`,
      reuseExistingServer: true,
      timeout: 180_000,
      env: { E2E_PORT: String(PORT) },
    },
    {
      command: `npm --prefix ../frontend run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT}`,
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { VITE_API_TARGET: `http://127.0.0.1:${PORT}` },
    },
  ],
})
