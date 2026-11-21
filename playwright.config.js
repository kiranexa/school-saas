import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { PORT, URL_A } from './e2e/config.js';

dotenv.config({ path: '.env.e2e' });   // tidak menimpa env yang sudah ada (CI)

export default defineConfig({
  testDir: './e2e/specs',
  globalSetup: './e2e/global-setup.js',
  globalTeardown: './e2e/global-teardown.js',
  fullyParallel: false,          // semua tes memakai satu database
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: URL_A,              // http://e2e-a.localhost:5174
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // mode e2e -> Vite membaca .env.e2e (project STAGING), bukan .env
    command: `npm run dev -- --mode e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
