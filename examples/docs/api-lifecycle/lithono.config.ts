import { defineConfig, node } from 'lithono/config';

export default defineConfig({
  adapter: node(),
  elements: {
    'motion-sample': { import: '@/components/motion-sample.client.ts', mode: 'client-only' },
    'lithono-animate': { import: '@/components/motion-sample.client.ts', mode: 'client-only' },
  },
});
