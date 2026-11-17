import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import routes from './index.ts';
import { createLithonoApp } from 'lithono/server';
const app = new Hono();
app.use('/assets/*', serveStatic({ root: './dist/client' }));
for (const [path, inline] of [['/linked', 'none'], ['/legacy', 'critical'], ['/all', 'all']] as const) {
  const appWithPolicy = createLithonoApp({ inline });
  app.get(path, (c) => appWithPolicy.request(new URL('/', c.req.url).href));
}
app.route('/', routes);
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: Number(process.env.PORT ?? 4185) });
