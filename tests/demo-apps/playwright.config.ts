import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const database = process.env.LITHONO_TEST_DATABASE ?? join(mkdtempSync(join(tmpdir(), 'lithono-demo-apps-')), 'app.sqlite');
process.env.LITHONO_TEST_DATABASE = database;

export default defineConfig({
  testDir: '.',
  outputDir: 'results',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4197', browserName: 'chromium' },
  webServer: {
    command: 'pnpm exec tsx tests/demo-apps/server.ts',
    cwd: root,
    url: 'http://127.0.0.1:4197/lists',
    reuseExistingServer: false,
    env: {
      LITHONO_DEMO_DATABASE: database,
      LITHONO_DEMO_CACHE: join(dirname(database), 'vite-cache'),
      BETTER_AUTH_URL: 'http://127.0.0.1:4197',
      LITHONO_MAP_STYLE_URL: 'http://127.0.0.1:4197/test-property-style.json',
      LITHONO_MAP_ATTRIBUTION: 'Deterministic local test style; no basemap data',
      NODE_OPTIONS: '--import=./tests/demo-apps/provider.mjs',
      RESEND_API_KEY: 'deterministic-test-key',
      RESEND_FROM: 'test@example.test',
      STRIPE_SECRET_KEY: 'sk_test_local_fixture',
      STRIPE_WEBHOOK_SECRET: 'whsec_local_fixture',
      LITHONO_APP_ORIGIN: 'http://127.0.0.1:4197',
      LITHONO_EDITOR_EMAILS: 'community-editor@example.test',
    },
  },
});
