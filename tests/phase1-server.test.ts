import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import { LitElement, html } from 'lit';
import type { MiddlewareHandler } from 'hono';
import type { GraphModule } from '../src/framework/server/routes.ts';
import type { LithonoAppOptions } from '../src/framework/server/index.ts';
import type { LithonoData } from '../src/framework/types.ts';

// Use Vite's server module loader, as production/dev do, but supply a controlled
// filesystem route graph. Requests exercise createLithonoApp and real Hono/SSR.
let vite: ViteDevServer;
let createApp: typeof import('../src/framework/server/index.ts').createLithonoApp;
let readSsrData: () => LithonoData;
let modules: Record<string, GraphModule>;
const fixtureKey = '__lithonoPhase1Routes';

before(async () => {
  Object.assign(globalThis, { [fixtureKey]: () => modules });
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    plugins: [{
      name: 'phase1-fixture-routes',
      enforce: 'pre',
      load(id) {
        if (id.endsWith('/framework/server/discover.ts')) {
          return `export async function loadPageModules() { return globalThis.${fixtureKey}(); }
            export function loadElementModules() { return {}; }`;
        }
      },
    }],
  });
  ({ createLithonoApp: createApp } = await vite.ssrLoadModule('/src/framework/server/index.ts'));
  ({ getLithonoData: readSsrData } = await vite.ssrLoadModule('/src/framework/client/data.ts'));
});

after(async () => {
  await vite?.close();
  Reflect.deleteProperty(globalThis, fixtureKey);
});

function resource(middleware: MiddlewareHandler[], page: GraphModule, options: LithonoAppOptions = {}) {
  modules = {
    '/src/pages/middleware.ts': { default: middleware },
    '/src/pages/page.ts': page,
  };
  return createApp({ inline: 'none', ...options });
}

test('middleware return and c.res short-circuit before locals, loaders or actions', async () => {
  for (const mode of ['return', 'c.res'] as const) {
    let calls = 0;
    const app = resource([async (c) => {
      const response = c.text('blocked', 401);
      if (mode === 'return') return response;
      c.res = response;
    }], {
      loader: () => { calls++; },
      actions: { save: { method: 'POST', run: () => { calls++; } } } as never,
    }, { locals: () => { calls++; return {}; } });
    for (const method of ['GET', 'POST']) {
      const response = await app.request(method === 'GET' ? '/' : '/?_action=save', { method });
      assert.equal(response.status, 401);
      assert.equal(await response.text(), 'blocked');
    }
    assert.equal(calls, 0);
  }
});

test('nested middleware next executes the loader once and unwinds in order', async () => {
  const order: string[] = [];
  const app = resource([
    async (_c, next) => { order.push('outer before'); await next(); order.push('outer after'); },
    async (_c, next) => { order.push('inner before'); await next(); order.push('inner after'); },
  ], { loader: () => { order.push('loader'); return { loaded: true }; } });
  const response = await app.request('/');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { loaded: true });
  assert.deepEqual(order, ['outer before', 'inner before', 'loader', 'inner after', 'outer after']);
});

test('Hono rejects a second next instead of running the loader twice', async () => {
  let loads = 0;
  const app = resource([async (_c, next) => { await next(); await next(); }], {
    loader: () => { loads++; return 'loaded'; },
  });
  const errors: unknown[] = [];
  const old = console.error;
  console.error = (error) => { errors.push(error); };
  try {
    assert.equal((await app.request('/')).status, 500);
    assert.equal(loads, 1);
    assert.match(String(errors[0]), /next\(\) called multiple times/);
  } finally { console.error = old; }
});

test('post-next middleware sees finalized response, adds headers and replaces response', async () => {
  let loads = 0;
  const app = resource([
    async (c, next) => {
      await next();
      c.header('X-After', 'outer');
      assert.equal(c.res.status, 202);
    },
    async (c, next) => {
      c.header('X-Before', 'prepared');
      await next();
      assert.equal(c.res.status, 200);
      assert.deepEqual(await c.res.json(), { loaded: true });
      c.res = c.text('replacement', 202);
    },
  ], { loader: () => { loads++; return { loaded: true }; } });
  const response = await app.request('/');
  assert.equal(response.status, 202);
  assert.equal(await response.text(), 'replacement');
  assert.equal(response.headers.get('X-Before'), 'prepared');
  assert.equal(response.headers.get('X-After'), 'outer');
  assert.equal(loads, 1);
});

test('auth middleware runs before plugin/app locals, actions and refresh loaders', async () => {
  const order: string[] = [];
  const user = { id: 'u1', email: 'test@example.test', name: 'Test' };
  const app = resource([async (c, next) => {
    order.push('auth');
    c.set('authenticatedUser', user);
    await next();
  }], {
    loader: (ctx) => { order.push('loader'); assert.equal(ctx.user, user); return { id: ctx.user?.id }; },
    actions: { save: { method: 'POST', run: (ctx: { user?: unknown }) => {
      order.push('action'); assert.equal(ctx.user, user); return 'saved';
    } } } as never,
  }, {
    plugins: [{ name: 'auth-locals', locals: (c) => {
      order.push('plugin locals'); return { user: c.get('authenticatedUser') };
    } }],
    locals: (c) => { order.push('app locals'); assert.equal(c.get('authenticatedUser'), user); return {}; },
  });
  const response = await app.request('/?_action=save', {
    method: 'POST', headers: { Accept: 'application/json' },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.value, 'saved');
  assert.deepEqual(body.meta.refresh.payload.data, { id: 'u1' });
  assert.deepEqual(order, ['auth', 'plugin locals', 'app locals', 'action', 'loader']);
  order.length = 0;
  assert.deepEqual(await (await app.request('/')).json(), { id: 'u1' });
  assert.deepEqual(order, ['auth', 'plugin locals', 'app locals', 'loader']);
});

class ProjectionPage extends LitElement {
  static tagName = 'phase1-projection-page';
  static root = 'light';
  session?: unknown;
  override render() {
    const { user, session } = readSsrData();
    return html`<pre id="ssr-projection">${JSON.stringify({ user, session, propertySession: this.session })}</pre>`;
  }
}

test('custom error documents retain explicit loader HttpError status', async () => {
  const { HttpError } = await vite.ssrLoadModule('/src/framework/define.ts');
  class ErrorDocument extends LitElement {
    static tagName = 'phase1-http-error-document';
    static root = 'light';
    override render() { return html`<h1>Permission denied</h1>`; }
  }
  customElements.define(ErrorDocument.tagName, ErrorDocument);
  let metaError: unknown;
  modules = {
    '/src/pages/page.ts': { loader: () => { throw new HttpError(403, 'Editorial access required'); } },
    '/src/pages/page.html': { default: ErrorDocument },
    '/src/pages/error.ts': {
      meta: (ctx: { data: unknown; error?: unknown }) => {
        metaError = ctx.error;
        return { title: `Error: ${ctx.error instanceof Error ? ctx.error.message : 'unknown'}` };
      },
    },
    '/src/pages/error.html': { default: ErrorDocument },
  };
  const response = await createApp({ inline: 'none' }).request('/');
  assert.equal(response.status, 403);
  const body = await response.text();
  assert.match(body, /Permission denied/);
  assert.match(body, /<title>Error: Editorial access required<\/title>/);
  assert.ok(metaError instanceof Error);
});

test('auth public projections default to null and match SSR helpers, page property and boot JSON', async () => {
  customElements.define(ProjectionPage.tagName, ProjectionPage);
  const user = { id: 'u1', email: 'test@example.test', name: 'Test', privateUser: 'secret-user' };
  const session = { id: 's1', userId: 'u1', token: 'secret-session' };
  for (const projected of [false, true]) {
    let userCalls = 0;
    let sessionCalls = 0;
    modules = {
      '/src/pages/page.ts': { loader: (ctx) => {
        assert.equal(ctx.user, user); assert.equal(ctx.session, session); return {};
      } },
      '/src/pages/page.html': { default: ProjectionPage, hydrate: true },
    };
    const app = createApp({
      inline: 'none', locals: () => ({ user, session }),
      ...(projected ? {
        auth: {
          publicUser: (ctx) => { userCalls++; assert.equal(ctx.user, user); return { id: user.id, email: user.email, name: user.name }; },
          publicSession: async (ctx) => { sessionCalls++; assert.equal(ctx.session, session); return { signedIn: true }; },
        },
      } : {}),
    });
    const response = await app.request('/');
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(!body.includes('secret-user'));
    assert.ok(!body.includes('secret-session'));
    const boot = JSON.parse(body.match(/<script[^>]*id="__LITHONO_DATA__"[^>]*>([\s\S]*?)<\/script>/)![1]);
    const expectedUser = projected ? { id: user.id, email: user.email, name: user.name } : null;
    const expectedSession = projected ? { signedIn: true } : null;
    assert.deepEqual(boot.user, expectedUser);
    assert.deepEqual(boot.session, expectedSession);
    const ssr = body.match(/<pre id="ssr-projection">([\s\S]*?)<\/pre>/)![1]
      .replace(/<!--[\s\S]*?-->/g, '').replaceAll('&quot;', '"');
    assert.deepEqual(JSON.parse(ssr), { user: expectedUser, session: expectedSession, propertySession: expectedSession });
    assert.equal(userCalls, projected ? 1 : 0);
    assert.equal(sessionCalls, projected ? 1 : 0);
  }
});
