import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import type { createLithonoApp } from '../../src/framework/server/index.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  root,
  cacheDir: process.env.LITHONO_PHASE2_CACHE ?? 'node_modules/.vite-phase2-browser',
  // The fixture's synthetic page graph has no index.html for Vite to scan.
  // Discover its browser graph up front so the first adoption does not race a
  // second optimizer generation and receive Outdated Optimize Dep responses.
  optimizeDeps: {
    entries: ['tests/phase2-browser/elements.ts', 'src/framework/client/bootstrap.ts'],
    include: ['lit', 'lit/decorators.js', 'lit/directives/repeat.js', '@lit/context', '@lit-labs/ssr-client', '@lit-labs/ssr-client/lit-element-hydrate-support.js'],
  },
  appType: 'custom',
  server: { host: '127.0.0.1', port: 4179, strictPort: true, hmr: false, ws: false },
  plugins: [{
    name: 'phase2-browser-fixture', enforce: 'pre',
    resolveId(id) {
      if (id === 'virtual:lithono-elements') return '\0phase2-elements';
      if (id === '/@lithono/bootstrap') return `${root}src/framework/client/bootstrap.ts`;
    },
    load(id) {
      if (id.includes('/src/pages/') && id.endsWith('.html')) return `export * from '/tests/phase2-browser/elements.ts';`;
      if (id === '\0phase2-elements') return `export const elementModules = new Proxy({}, { get: () => () => import('/tests/phase2-browser/elements.ts') });`;
      if (id.endsWith('/framework/server/discover.ts')) return `export { loadPageModules, loadElementModules } from '/tests/phase2-browser/routes.ts';`;
    },
    configureServer(server) {
      let app: ReturnType<typeof createLithonoApp>;
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/phase2/')) return next();
        try {
          app ??= (await server.ssrLoadModule('/src/framework/server/index.ts')).createLithonoApp({
            inline: 'none',
            auth: {
              publicUser: () => ({ id: 'public', email: 'public@example.test', name: 'Public' }),
              publicSession: () => ({ public: true }),
            },
          });
          const url = `http://127.0.0.1:4179${req.url}`;
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const response = await app.request(url, {
            method: req.method, headers: req.headers as Record<string, string>,
            ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
          });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          let body = await response.text();
          if (response.headers.get('Content-Type')?.includes('text/html')) {
            // Capture SSR identities before module loading, including a focused draft.
            body = body.replace('<script id="__LITHONO_DATA__"', `<script>
              window.ssrNodes = [...document.querySelectorAll('phase2-layout, phase2-page, #draft, li, phase2-counter, phase2-shadow, .outlet')];
              document.querySelector('#draft').value = 'pre-hydration draft';
              document.querySelector('#draft').focus();
            </script><script id="__LITHONO_DATA__"`);
          }
          res.end(body);
        } catch (error) { next(error); }
      });
    },
  }],
});
