import { createServer } from 'vite';

// Load the actual application config with an isolated dependency cache, so the
// regression server cannot invalidate the developer's running pnpm dev cache.
const server = await createServer({
  cacheDir: process.env.LITHONO_DEMO_CACHE,
  server: { host: '127.0.0.1', port: 4197, strictPort: true },
});
await server.listen();
