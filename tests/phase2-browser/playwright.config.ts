import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1,
  outputDir: './results',
  use: { baseURL: 'http://127.0.0.1:4179', browserName: 'chromium', headless: true },
  webServer: {
    cwd: new URL('../../', import.meta.url).pathname,
    command: 'pnpm exec vite --config tests/phase2-browser/vite.config.ts',
    url: 'http://127.0.0.1:4179/phase2/test', reuseExistingServer: false,
  },
});
