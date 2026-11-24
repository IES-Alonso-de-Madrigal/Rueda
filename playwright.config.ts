import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] }
    }
  ],
  webServer: {
    command:
      'DATABASE_PATH=./data/e2e.db ORIGIN=http://127.0.0.1:4173 npm run build && DATABASE_PATH=./data/e2e.db ORIGIN=http://127.0.0.1:4173 PORT=4173 node build',
    url: 'http://127.0.0.1:4173/health',
    reuseExistingServer: false,
    timeout: 60_000
  }
});
