import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import app from './index.js';
const server = new Hono();
server.use('/assets/*', serveStatic({ root: './dist/client' }));
server.route('/', app);
serve({ fetch: server.fetch, port: Number(process.env.PORT ?? 5173) });
