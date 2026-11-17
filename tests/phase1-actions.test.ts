import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { dispatchAction, readActionRequest, isSameOriginActionRequest } from '../src/framework/server/actions.ts';
import { createActionProxy, ActionRequestError } from '../src/framework/client/action-proxy.ts';
import { unwrapActionResult, getLithonoData } from '../src/framework/client/data.ts';
import { ACTION_PROTOCOL_HEADER, actionSuccess, parseActionEnvelope } from '../src/framework/action-protocol.ts';
import { HttpError, redirect } from '../src/framework/define.ts';
import type { ActionDefinition } from '../src/framework/types.ts';

type Loaders = () => Promise<{ data?: unknown; layoutData?: unknown[]; params: Record<string, string> }>;
function appFor(run: ActionDefinition['run'], options: { method?: ActionDefinition['method']; loaders?: Loaders; input?: ActionDefinition<never>['input'] } = {}) {
  const app = new Hono();
  app.all('/page', async (c) => {
    const request = await readActionRequest(c);
    const result = await dispatchAction({
      c, actionName: request.name ?? 'save',
      actions: { save: { method: options.method ?? 'POST', run, input: options.input } as ActionDefinition<never, unknown> },
      params: { id: '1' }, locals: {}, request, loaders: options.loaders,
    });
    if (result.type === 'failure') return c.json(result.failure, result.failure.status as 400);
    return result.response;
  });
  return app;
}
function request(headers: HeadersInit = {}, body = '{}', method = 'POST') {
  return new Request('https://example.test/page?_action=save', {
    method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
    ...(method === 'GET' ? {} : { body }),
  });
}
async function envelope(response: Response) {
  assert.equal(response.headers.get(ACTION_PROTOCOL_HEADER), '1');
  return parseActionEnvelope(await response.json());
}

test('round trips null, arrays, primitives, undefined and application metadata keys with and without loaders', async () => {
  const values = [null, [1, null, 'a'], 0, false, '', 'hello', undefined,
    { result: 7, revalidate: false, redirect: '/ordinary-data', __lithono: { data: 'application' } }];
  for (const value of values) {
    for (const loaders of [undefined, async () => ({ data: { fresh: true }, layoutData: [null], params: { id: '1' } })]) {
      const res = await appFor(() => value, { loaders }).fetch(request());
      assert.equal(res.status, 200);
      const wire = await envelope(res);
      assert.ok(wire.ok);
      assert.equal(wire.meta.refresh.status, loaders ? 'success' : 'skipped');
      assert.deepEqual(unwrapActionResult(wire), value);
    }
  }
});

test('GET and request opt-out skip loaders; result revalidate/redirect keys do not', async () => {
  let loads = 0;
  const loaders = async () => { loads++; return { params: {} }; };
  await appFor(() => null, { method: 'GET', loaders }).fetch(request({}, '', 'GET'));
  await appFor(() => null, { loaders }).fetch(request({ 'X-Lithono-Revalidate': '0' }));
  assert.equal(loads, 0);
  await appFor(() => ({ revalidate: false, redirect: '/data' }), { loaders }).fetch(request());
  assert.equal(loads, 1);
});

test('successful mutation plus failed refresh stays successful, logs details and emits a separate refresh event', async () => {
  let mutations = 0;
  const secret = new Error('private loader credentials');
  const logs: unknown[][] = [];
  const events: Event[] = [];
  const oldError = console.error;
  const oldDocument = globalThis.document;
  const oldCustomEvent = globalThis.CustomEvent;
  console.error = (...args) => { logs.push(args); };
  Object.assign(globalThis, {
    document: { getElementById: () => null, querySelector: () => ({ dispatchEvent: (event: Event) => events.push(event) }) },
    CustomEvent: class extends Event { detail: unknown; constructor(type: string, init: CustomEventInit) { super(type, init); this.detail = init.detail; } },
  });
  try {
    const boot = getLithonoData();
    const before = boot.data;
    const res = await appFor(() => { mutations++; return { saved: true }; }, { loaders: async () => { throw secret; } }).fetch(request());
    assert.equal(res.status, 200);
    const wire = await envelope(res);
    assert.ok(wire.ok);
    assert.deepEqual(wire.meta.refresh, { status: 'failed', message: 'Loader refresh failed' });
    assert.deepEqual(unwrapActionResult(wire), { saved: true });
    assert.equal(mutations, 1);
    assert.equal(logs[0]?.[1], secret);
    assert.equal(events[0]?.type, 'lithono:revalidate-error');
    assert.equal(boot.data, before);
    assert.ok(!JSON.stringify(wire).includes(secret.message));
  } finally {
    console.error = oldError;
    Object.assign(globalThis, { document: oldDocument, CustomEvent: oldCustomEvent });
  }
});

test('successful refresh updates cached boot data and emits revalidation', () => {
  const oldDocument = globalThis.document;
  const oldCustomEvent = globalThis.CustomEvent;
  const events: Event[] = [];
  const bootJson = JSON.stringify({ data: 'old', params: {}, layoutData: [], actions: {} });
  Object.assign(globalThis, {
    document: { getElementById: () => ({ textContent: bootJson }), querySelector: () => ({ dispatchEvent: (event: Event) => events.push(event) }) },
    CustomEvent: class extends Event { detail: unknown; constructor(type: string, init: CustomEventInit) { super(type, init); this.detail = init.detail; } },
  });
  try {
    const wire = actionSuccess(null, { status: 'success', payload: { data: null, layoutData: [], params: { id: '2' } } });
    assert.equal(unwrapActionResult(wire), null);
    assert.equal(getLithonoData().data, null);
    assert.deepEqual(getLithonoData().params, { id: '2' });
    assert.equal(events[0]?.type, 'lithono:revalidate');
  } finally { Object.assign(globalThis, { document: oldDocument, CustomEvent: oldCustomEvent }); }
});

test('unserializable loader data is a refresh failure, not a mutation failure', async () => {
  const old = console.error;
  const logs: unknown[][] = [];
  console.error = (...args) => { logs.push(args); };
  try {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    for (const data of [circular, 1n]) {
      const res = await appFor(() => 'saved', { loaders: async () => ({ data, params: {} }) }).fetch(request());
      assert.equal(res.status, 200);
      const wire = await envelope(res);
      assert.ok(wire.ok);
      assert.equal(wire.meta.refresh.status, 'failed');
      assert.equal(unwrapActionResult(wire), 'saved');
    }
    assert.equal(logs.length, 2);
  } finally { console.error = old; }
});

test('unsafe same-origin guard covers Origin, Referer, fetch metadata, and missing provenance', async () => {
  const cases: [HeadersInit, boolean][] = [
    [{ Origin: 'https://example.test' }, true],
    [{ Origin: 'https://other.test' }, false],
    [{ Origin: 'http://example.test' }, false],
    [{ Origin: 'https://example.test:444' }, false],
    [{ Origin: 'null', Referer: 'https://example.test/page' }, false],
    [{ Origin: 'invalid' }, false],
    [{ Origin: 'https://example.test/path' }, false],
    [{ Origin: 'https://example.test', Referer: 'https://other.test' }, true],
    [{ Referer: 'https://example.test/path?x=1' }, true],
    [{ Referer: 'https://other.test/page' }, false],
    [{ Referer: 'invalid' }, false],
    [{}, true],
    [{ 'Sec-Fetch-Site': 'same-origin' }, true],
    [{ 'Sec-Fetch-Site': 'none' }, true],
    [{ 'Sec-Fetch-Site': 'same-site' }, false],
    [{ 'Sec-Fetch-Site': 'cross-site' }, false],
    [{ Origin: 'https://example.test', 'Sec-Fetch-Site': 'cross-site' }, false],
    [{ Origin: 'https://other.test', 'X-Forwarded-Host': 'other.test' }, false],
  ];
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
    for (const [headers, allowed] of cases) {
      let ran = false;
      let loaded = false;
      const req = request(headers, '{invalid', method);
      assert.equal(isSameOriginActionRequest(req), allowed, `${method} ${JSON.stringify(headers)}`);
      const res = await appFor(() => { ran = true; }, { method, loaders: async () => { loaded = true; return { params: {} }; } }).fetch(req);
      assert.equal(res.status, allowed ? 400 : 403);
      assert.equal(ran, false);
      assert.equal(loaded, false);
    }
  }
  assert.equal(isSameOriginActionRequest(request({ Origin: 'https://other.test' }, '', 'GET')), true);
  // Ordinary SSR form submission is also blocked before the action runs.
  let ran = false;
  const form = new Request('https://example.test/page', { method: 'POST', headers: { Origin: 'https://other.test', 'Content-Type': 'application/x-www-form-urlencoded' }, body: '_action=save&name=a' });
  assert.equal((await appFor(() => { ran = true; }).fetch(form)).status, 403);
  assert.equal(ran, false);
});

test('unexpected action and validation errors are generic, logged, and never run loaders', async () => {
  const logs: unknown[][] = [];
  const old = console.error;
  console.error = (...args) => { logs.push(args); };
  try {
    let loads = 0;
    const secret = new Error('database password');
    const res = await appFor(() => { throw secret; }, { loaders: async () => { loads++; return { params: {} }; } }).fetch(request());
    assert.equal(res.status, 500);
    const wire = await envelope(res);
    assert.ok(!wire.ok);
    assert.equal(wire.error.message, 'Action failed');
    assert.equal(logs[0]?.[1], secret);
    assert.equal(loads, 0);
    const input = { '~standard': { version: 1, vendor: 'test', validate() { throw new SyntaxError('private schema details'); } } };
    const validation = await appFor(() => { assert.fail('must not run'); }, { input: input as never }).fetch(request());
    assert.equal(validation.status, 500);
    assert.ok(!(await validation.text()).includes('private schema details'));
    for (const error of [new HttpError(422, 'Public failure'), new HttpError(503, 'Private failure')]) {
      const wire = await envelope(await appFor(() => { throw error; }).fetch(request()));
      assert.ok(!wire.ok);
      assert.equal(wire.error.message, error.expose ? 'Public failure' : 'Request failed');
    }
  } finally { console.error = old; }
});

test('validation issues, unknown actions and method errors use the failure protocol; SSR keeps failure values', async () => {
  const issues = [{ message: 'Required', path: ['name'] }];
  const input = { '~standard': { version: 1, vendor: 'test', validate: () => ({ issues }) } };
  const app = appFor(() => { assert.fail('must not run'); }, { input: input as never });
  const res = await app.fetch(request());
  assert.equal(res.status, 400);
  const wire = await envelope(res);
  assert.ok(!wire.ok);
  assert.deepEqual(wire.error.issues, issues);
  const form = new Request('https://example.test/page', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '_action=save&name=posted' });
  const failure = await (await app.fetch(form)).json();
  assert.deepEqual(failure.values, { name: 'posted' });
  const missing = new Request('https://example.test/page?_action=missing', { method: 'POST', headers: { Accept: 'application/json' } });
  assert.equal((await app.fetch(missing)).status, 404);
  const wrong = await app.fetch(request({}, '', 'GET'));
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get('Allow'), 'POST');
});

test('returned/thrown redirects use metadata for JSON, preserve cookies, and remain HTTP redirects for HTML', async () => {
  for (const thrown of [true, false]) {
    const app = appFor(({ c }) => {
      c.header('Set-Cookie', 'context=1; Path=/');
      if (thrown) redirect('/next');
      return new Response(null, { status: 307, headers: { Location: '/next', 'Set-Cookie': 'raw=1; Path=/' } });
    });
    const res = await app.fetch(request());
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('Set-Cookie')?.includes('context=1'));
    if (!thrown) assert.ok(res.headers.get('Set-Cookie')?.includes('raw=1'));
    const wire = await envelope(res);
    assert.ok(wire.ok);
    assert.equal(wire.meta.redirect, '/next');
    const html = await app.fetch(new Request('https://example.test/page?_action=save', { method: 'POST' }));
    assert.equal(html.status, thrown ? 303 : 307);
    assert.equal(html.headers.get('Location'), '/next');
    assert.ok(html.headers.get('Set-Cookie')?.includes('context=1'));
    if (!thrown) assert.ok(html.headers.get('Set-Cookie')?.includes('raw=1'));
  }
  const htmlData = await appFor(() => ({ redirect: '/application' })).fetch(new Request('https://example.test/page?_action=save', { method: 'POST' }));
  assert.equal(htmlData.headers.get('Location'), '/page');
  const res = await appFor(({ c }) => { c.header('Set-Cookie', 'session=1'); return null; }).fetch(request());
  assert.ok(res.headers.get('Set-Cookie')?.includes('session=1'));
});

test('native mutation return retains the same-page query and removes only the action discriminator', async () => {
  for (const [referer, expected] of [
    ['https://example.test/page?project=harbor&range=30&foreign=a&foreign=b', '/page?project=harbor&range=30&foreign=a&foreign=b'],
    ['https://example.test/other?project=wrong', '/page?range=30'],
    ['', '/page?range=30'],
  ]) {
    const response = await appFor(() => ({ saved: true })).fetch(new Request('https://example.test/page?range=30&_action=save', {
      method: 'POST', headers: referer ? { referer } : {},
    }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), expected);
  }
});

test('client end-to-end: envelope decoding, raw responses, redirects, errors, and invalid protocols', async () => {
  const oldFetch = globalThis.fetch;
  const oldWindow = globalThis.window;
  const assigned: string[] = [];
  Object.assign(globalThis, { window: { location: { origin: 'https://example.test', assign: (url: string) => assigned.push(url) } } });
  const proxy = createActionProxy('/page', { save: { method: 'POST' } }, unwrapActionResult) as Record<string, (payload?: unknown, options?: RequestInit) => Promise<unknown>>;
  try {
    const app = appFor(({ input }) => input);
    globalThis.fetch = async (url, init) => app.fetch(new Request(String(url), init));
    assert.equal(await proxy.save(null), null);
    assert.deepEqual(await proxy.save([1, 2]), [1, 2]);
    assert.deepEqual(await proxy.save({ redirect: '/data', revalidate: false }), { redirect: '/data', revalidate: false });
    assert.deepEqual(assigned, []);
    const defaults = createActionProxy('/page', { save: { method: 'POST' } }) as typeof proxy;
    assert.equal(await defaults.save(9), 9);
    assert.equal((proxy as unknown as { then: unknown }).then, undefined);
    globalThis.fetch = async () => new Response(JSON.stringify({ __lithono: 'ordinary', version: 1 }), { headers: { 'Content-Type': 'application/json' } });
    assert.deepEqual(await proxy.save(), { __lithono: 'ordinary', version: 1 });
    const raw = new Response('download', { headers: { 'Content-Type': 'text/plain' } });
    globalThis.fetch = async () => raw;
    assert.equal(await proxy.save(), raw);
    assert.equal(await raw.text(), 'download');
    for (const status of [204, 205]) {
      globalThis.fetch = async () => new Response(null, { status });
      assert.equal(await proxy.save(), undefined);
    }
    globalThis.fetch = async (url, init) => appFor(() => redirect('/login')).fetch(new Request(String(url), init));
    assert.equal(await proxy.save(), undefined);
    assert.equal(assigned.pop(), 'https://example.test/login');
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: '/manual' } });
    await proxy.save({}, { redirect: 'manual' });
    assert.equal(assigned.pop(), 'https://example.test/manual');
    const followed = new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } });
    Object.defineProperties(followed, { redirected: { value: true }, url: { value: 'https://example.test/followed' } });
    globalThis.fetch = async () => followed;
    assert.equal(await proxy.save(), undefined);
    assert.equal(assigned.pop(), 'https://example.test/followed');
    globalThis.fetch = async () => new Response('private HTML details', { status: 500 });
    await assert.rejects(proxy.save(), (error: unknown) => error instanceof ActionRequestError && error.status === 500 && !error.message.includes('private'));
    for (const value of [null, [], 7, { message: { private: 'details' } }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(value), { status: 400, headers: { 'Content-Type': 'application/json' } });
      await assert.rejects(proxy.save(), (error: unknown) => error instanceof ActionRequestError && error.status === 400);
    }
    globalThis.fetch = async (url, init) => appFor(() => { throw new HttpError(422, 'Fix input'); }).fetch(new Request(String(url), init));
    await assert.rejects(proxy.save(), (error: unknown) => error instanceof ActionRequestError && error.message === 'Fix input' && error.status === 422);
    for (const [version, body] of [['2', actionSuccess(1)], ['1', { version: 1, ok: true }], ['1', actionSuccess(1, { status: 'success', payload: { params: { bad: 3 } } } as never)]]) {
      globalThis.fetch = async () => new Response(JSON.stringify(body), { headers: { [ACTION_PROTOCOL_HEADER]: String(version), 'Content-Type': 'application/json' } });
      await assert.rejects(proxy.save(), /protocol/);
    }
    const opaque = new Response(null);
    Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' });
    globalThis.fetch = async () => opaque;
    await assert.rejects(proxy.save(), /opaque/);
  } finally { Object.assign(globalThis, { fetch: oldFetch, window: oldWindow }); }
});
