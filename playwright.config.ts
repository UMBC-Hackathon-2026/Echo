import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against `next dev` (NODE_ENV=development) so the scripted evaluator
 * is eligible. Selection is via E2E_EVALUATOR:
 *   - "scripted": deterministic ScriptedEvaluator, zero live Gemini (npm run e2e:scripted)
 *   - unset:      real Gemini evaluator, for the teammate's manual live run (npm run e2e:live)
 * The scripted grep tag keeps the two suites separate.
 */
const evaluatorMode = process.env.E2E_EVALUATOR === 'scripted' ? 'scripted' : 'live';
const externalBaseURL = evaluatorMode === 'live' ? process.env.BASE_URL : undefined;
const baseURL = externalBaseURL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  timeout: 60000,
  grep: evaluatorMode === 'scripted' ? /@scripted/ : /@live/,
  webServer: externalBaseURL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Never "production": the scripted evaluator is honored only in dev.
      E2E_EVALUATOR: process.env.E2E_EVALUATOR ?? '',
      NEXT_PUBLIC_USE_MOCKS: 'false',
      NEXT_PUBLIC_DEMO_HELPER: process.env.NEXT_PUBLIC_DEMO_HELPER ?? 'false',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
