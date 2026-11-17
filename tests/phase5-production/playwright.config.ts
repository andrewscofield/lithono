import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, outputDir: './results',
  use: { baseURL: 'http://127.0.0.1:4185', browserName: 'chromium', headless: true },
  webServer: [{
    command: 'node tests/phase5-production/deploy.mjs',
    cwd: new URL('../../', import.meta.url).pathname,
    url: 'http://127.0.0.1:4185', reuseExistingServer: false, timeout: 120000,
  }, {
    command: 'node tests/phase5-production/deploy.mjs --example',
    cwd: new URL('../../', import.meta.url).pathname,
    url: 'http://127.0.0.1:4186', reuseExistingServer: false, timeout: 120000,
  }],
});
