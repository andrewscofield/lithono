import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import lithonoApp from './index.ts';

const app = new Hono();

app.use('/assets/*', serveStatic({ root: './dist/client' }));
app.use('/assets/*', serveStatic({ root: './dist/server' }));
app.route('/', lithonoApp);

const port = Number(process.env.PORT ?? 5173);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Lithono listening on http://localhost:${info.port}`);
});
