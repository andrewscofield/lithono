import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { lithono } from '../../src/framework/vite.ts';

const root = fileURLToPath(new URL('./', import.meta.url));
const workspace = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  root, cacheDir: `${workspace}node_modules/.vite-phase4-interop`, appType: 'custom',
  optimizeDeps: { entries: [], noDiscovery: true },
  server: { host: '127.0.0.1', port: 4181, strictPort: true, hmr: false, ws: false, fs: { allow: [workspace] } },
  plugins: [lithono({ elements: {
    'wa-button': { import: '@awesome.me/webawesome/dist/components/button/button.js', mode: 'client-only' },
    'delayed-element': { import: './external/delayed.mjs', mode: 'client-only' },
    'failed-element': { import: './external/failed.mjs', mode: 'client-only' },
    'slow-element': { import: './external/slow.mjs', mode: 'client-only' },
    'unused-element': { import: './external/unused.mjs', mode: 'client-only' },
    'external-shadow': { import: './external/shadow.mjs', mode: 'ssr' },
  } }), {
    name: 'phase4-interop-server',
    configureServer(server) {
      let app: { request(url: string): Promise<Response> } | undefined;
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/interop') && !req.url?.startsWith('/plain')) return next();
        try {
          if (!app) {
            const mod = (await server.ssrLoadModule(`${workspace}src/framework/server/index.ts`)) as {
              createLithonoApp(options: { inline: string }): { request(url: string): Promise<Response> };
            };
            app = mod.createLithonoApp({ inline: 'none' });
          }
          const response = await app.request(`http://127.0.0.1:4181${req.url}`);
          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
          let body = await response.text();
          if (req.url.startsWith('/interop')) body = body.replace('<script id="__LITHONO_DATA__"', `<script>
            window.originalHosts = [...document.querySelectorAll('js-element, mjs-element, light-element, external-shadow, wa-button, delayed-element, failed-element, slow-element')];
            window.originalFallback = document.querySelector('#fallback');
            window.originalShadowButton = document.querySelector('external-shadow').shadowRoot.querySelector('button');
            window.originalLightButton = document.querySelector('light-element button');
            document.querySelector('delayed-element').payload = { value: 'before upgrade' };
          </script><script id="__LITHONO_DATA__"`);
          res.end(body);
        } catch (error) { next(error); }
      });
    },
  }],
});
