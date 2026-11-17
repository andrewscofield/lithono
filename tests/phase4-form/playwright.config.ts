import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, outputDir: './results',
  use: { baseURL: 'http://127.0.0.1:4184', browserName: 'chromium', headless: true },
  webServer: {
    cwd: new URL('../../', import.meta.url).pathname,
    command: 'pnpm exec tsx tests/phase4-form/server.ts',
    url: 'http://127.0.0.1:4184/phase4', reuseExistingServer: false,
  },
});
