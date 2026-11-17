import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { Hono } from 'hono';
import { dispatchAction, readActionRequest } from '../../src/framework/server/actions.ts';
import type { ActionDefinition } from '../../src/framework/types.ts';

const app = new Hono();
let mutations = 0;
app.get('/phase4/count', (c) => c.json({ mutations }));
app.all('/phase4', async (c) => {
  const plainBody = c.req.header('Content-Type')?.startsWith('text/plain') ? await c.req.text() : undefined;
  const request = await readActionRequest(c);
  if (!request.name) return c.html(documentHtml);
  const result = await dispatchAction({
    c, actionName: request.name, request, locals: {}, params: {},
    actions: Object.fromEntries(['save', 'search', 'fail', 'malformed', 'issues', 'slow'].map((name) => [name, {
      method: name === 'search' ? 'GET' : 'POST',
      run: async ({ input }: { input: Record<string, unknown> }) => {
        mutations++;
        if (name === 'slow') await new Promise((resolve) => setTimeout(resolve, 250));
        if (name === 'malformed') return new Response('{broken', { headers: { 'Content-Type': 'application/json' } });
        if (name === 'fail') return new Response('unavailable', { status: 503 });
        if (name === 'issues') return new Response(JSON.stringify({
          message: 'Rejected', issues: [{ path: ['title'], message: 'Title rejected' }, { path: ['custom'], message: 'Custom rejected' }],
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        const serialize = (value: unknown): unknown => Array.isArray(value) ? value.map(serialize)
          : value instanceof File ? { name: value.name, size: value.size } : value;
        return c.json({ input: Object.fromEntries(Object.entries(input).map(([key, value]) => [key, serialize(value)])),
          method: c.req.method, url: c.req.url, contentType: c.req.header('Content-Type') ?? null, plainBody });
      },
    }])) as Record<string, ActionDefinition<never, unknown>>,
  });
  return result.type === 'response' ? result.response : c.json(result.failure, 400);
});

const documentHtml = `<!doctype html><html><head><title>Phase 4 forms</title></head><body>
<phase4-host>
<form id="form" method="post" action="/phase4?_action=save&destination=kept">
  <label>Title <input name="title" value="initial" required aria-describedby="hint"></label><span id="hint">Keep this hint</span>
  <span data-error-for="title" hidden></span>
  <input name="tag" value="one"><input name="tag" value="two">
  <select name="choice" multiple><option selected>A</option><option selected>B</option></select>
  <input type="checkbox" name="check" value="yes" checked><input type="checkbox" name="check" value="no">
  <fieldset disabled><input name="excluded" required><button type="submit" id="disabled">Disabled</button></fieldset>
  <input type="file" name="upload" multiple>
  <phase4-control name="custom" tabindex="0"></phase4-control><span data-error-for="custom" hidden></span>
  <button id="save" name="intent" value="save">Save</button>
  <button id="search" name="_action" value="search" formaction="/phase4?_action=search&obsolete=gone" formmethod="get">Search</button>
  <button id="multipart" name="intent" value="upload" formenctype="multipart/form-data">Upload</button>
  <button id="skip" formnovalidate>Skip validation</button>
  <button type="reset">Reset</button>
  <div data-form-error></div>
</form>
<input form="form" name="external" value="outside">
<output id="result"></output>
</phase4-host>
<script id="__LITHONO_DATA__" type="application/json">${JSON.stringify({ path: '/phase4', actions: Object.fromEntries(['save', 'search', 'fail', 'malformed', 'issues', 'slow'].map((name) => [name, { method: name === 'search' ? 'GET' : 'POST', fields: {} }])) })}</script>
<script type="module" src="/tests/phase4-form/elements.ts"></script>
</body></html>`;

const vite = await createViteServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
const server = createServer(async (req, res) => {
  if (!req.url?.startsWith('/phase4')) return vite.middlewares(req, res);
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const response = await app.request(`http://127.0.0.1:4184${req.url}`, {
      method: req.method, headers: req.headers as Record<string, string>,
      ...(!['GET', 'HEAD'].includes(req.method ?? 'GET') ? { body: Buffer.concat(chunks) } : {}),
    });
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
server.listen(4184, '127.0.0.1');
