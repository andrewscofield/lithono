import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import { jsonData, runWithSsrData } from '../src/framework/server/ssr-data.ts';
import { getLithonoData } from '../src/framework/client/data.ts';
import type { createLithonoApp } from '../src/framework/server/index.ts';

test('JSON data normalizes identically and rejects lossy rich values in every mode', () => {
  assert.deepEqual(jsonData({ missing: undefined, array: [undefined, null], nested: { value: 1 } }), { array: [null, null], nested: { value: 1 } });
  assert.equal(jsonData(undefined), null);
  for (const value of [new Date(), new Map(), 1n, NaN, Infinity, () => 1]) {
    assert.throws(() => jsonData(value), /JSON/);
  }
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.throws(() => jsonData(cyclic), /cycle/);
  const shared = { a: 1 };
  assert.deepEqual(jsonData([shared, shared]), [{ a: 1 }, { a: 1 }]);
});

test('SSR state stays request-local across interleaved asynchronous renders', async () => {
  const render = (id: string, delay: number) => runWithSsrData({ url: `https://example.test/${id}?q=full`, data: { id }, session: null }, async () => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const state = getLithonoData();
    return { url: state.url, data: state.data, session: state.session };
  });
  assert.deepEqual(await Promise.all([render('one', 10), render('two', 0)]), [
    { url: 'https://example.test/one?q=full', data: { id: 'one' }, session: null },
    { url: 'https://example.test/two?q=full', data: { id: 'two' }, session: null },
  ]);
});

let vite: ViteDevServer;
let app: ReturnType<typeof createLithonoApp>;
before(async () => {
  vite = await createServer({ configFile: 'tests/phase2-browser/vite.config.ts', server: { middlewareMode: true, watch: null } });
  const { createLithonoApp } = await vite.ssrLoadModule('/src/framework/server/index.ts');
  app = createLithonoApp({ inline: 'none', auth: { publicUser: () => ({ id: 'u', email: 'u@example.test', name: 'U' }), publicSession: () => ({ id: 's' }) } });
});
after(async () => { await vite?.close(); });

test('SSR boot, GET refresh and action refresh carry the same full state contract', async () => {
  const href = 'http://example.test/phase2/contract?rev=2&foreign=a&foreign=b';
  const html = await (await app.request(href)).text();
  const boot = JSON.parse(html.match(/<script id="__LITHONO_DATA__" type="application\/json">([\s\S]*?)<\/script>/)![1]);
  const refresh = await (await app.request(href, { headers: { 'X-Lithono-Revalidate': '1' } })).json();
  const action = await (await app.request(`${href}&_action=save`, { method: 'POST', headers: { Accept: 'application/json', Origin: 'http://example.test', Referer: href } })).json();
  for (const state of [refresh, action.meta.refresh.payload]) {
    for (const key of ['data', 'params', 'layoutData', 'layouts', 'url', 'path', 'actions', 'user', 'session']) {
      assert.deepEqual(state[key], boot[key], key);
    }
    assert.equal(state.failure, null);
  }
  assert.deepEqual(boot.layouts.map((layout: { id: string }) => layout.id), ['layout', 'phase2/layout']);
  assert.equal(boot.url, href);
});
