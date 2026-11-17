import { defineConfig } from '@playwright/test';
import development from './playwright.config.ts';

export default defineConfig({
  ...development,
  webServer: {
    ...development.webServer,
    command: 'node dist/server/src/server.js',
    env: {
      ...(development.webServer as { env: Record<string, string> }).env,
      NODE_ENV: 'production',
      PORT: '4197',
    },
  },
});
