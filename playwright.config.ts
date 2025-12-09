import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 120000,
  expect: { timeout: 5000 },
  webServer: {
    command: 'python app.py',
    port: 5000,
    cwd: process.cwd(),
    timeout: 120000,
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://127.0.0.1:5000',
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    actionTimeout: 20000
  }
});
