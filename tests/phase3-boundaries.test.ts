import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build, createServer, type UserConfig } from 'vite';
import { lithono } from '../src/framework/vite.ts';

async function fixture(files: Record<string, string>, run: (root: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'lithono-boundaries-'));
  try {
    symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir');
    for (const [file, code] of Object.entries(files)) {
      const path = join(root, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, code);
    }
    await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function bundle(root: string, overrides: UserConfig = {}) {
  return build({
    root, configFile: false, logLevel: 'silent', plugins: [lithono()],
    build: {
      write: false, minify: false, sourcemap: true,
      rolldownOptions: { input: join(root, 'entry.ts') },
    },
    ...overrides,
  });
}

test('default @/ imports use the configured project root for browser, dynamic and raw modules', async () => {
  await fixture({
    'entry.ts': `import { value } from '@/lib/value.ts';
      import source from '@/lib/value.ts?raw';
      import { createContext } from '@lit/context';
      console.log(value, source, createContext);
      globalThis.loadAliasedValue = () => import('@/lib/late.ts');`,
    'src/lib/value.ts': 'export const value = "aliased-browser-value";',
    'src/lib/late.ts': 'export const late = "aliased-dynamic-value";',
  }, async root => {
    const result = await bundle(root);
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
    const code = outputs.filter(output => output.type === 'chunk').map(output => output.code).join('\n');
    assert.match(code, /aliased-browser-value/);
    assert.match(code, /aliased-dynamic-value/);
    assert.doesNotMatch(code, /from ["']@\//);
  });
});

test('development SSR resolves static and dynamic @/ imports to the application root', async () => {
  await fixture({
    'entry.ts': `export { value } from '@/server/value.ts';
      export const load = () => import('@/server/late.ts');`,
    'src/server/value.ts': 'export const value = "aliased-server-value";',
    'src/server/late.ts': 'export const late = "aliased-server-dynamic-value";',
  }, async root => {
    const server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [lithono({})], server: { middlewareMode: true } });
    try {
      const module = await server.ssrLoadModule('/entry.ts');
      assert.equal(module.value, 'aliased-server-value');
      assert.equal((await module.load()).late, 'aliased-server-dynamic-value');
    } finally { await server.close(); }
  });
});

test('an explicit application alias can override the @/ default', async () => {
  await fixture({
    'entry.ts': `import { value } from '@/value.ts'; console.log(value);`,
    'src/value.ts': 'export const value = "default-source-root";',
    'alternate/value.ts': 'export const value = "configured-source-root";',
  }, async root => {
    for (const alias of [{ '@': join(root, 'alternate') }, [{ find: /^@\//, replacement: `${join(root, 'alternate')}/` }]]) {
      const result = await bundle(root, { resolve: { alias } });
      const code = (Array.isArray(result) ? result : [result]).flatMap(result => result.output).filter(output => output.type === 'chunk').map(output => output.code).join('\n');
      assert.match(code, /configured-source-root/);
      assert.doesNotMatch(code, /default-source-root/);
    }
  });
});

for (const expression of ["import { secret } from '@/server/secret'; console.log(secret);", "globalThis.loadSecret = () => import('@/server/secret');"]) {
  test(`default @/ imports preserve the client/server boundary: ${expression}`, async () => {
    await fixture({
      'entry.ts': expression,
      'src/server/secret.ts': 'export const secret = "must stay on server";',
    }, async root => {
      await assert.rejects(bundle(root), /Lithono: server-only module imported in the client bundle/);
    });
  });
}

test('source-plugin public URL entry shares the source codec/error identity rather than an older workspace artifact', async () => {
  const source = fileURLToPath(new URL('../src/framework/url.ts', import.meta.url));
  await fixture({
    'entry.ts': `import { QueryValidationError as publicError } from 'lithono/url';
      import { QueryValidationError as sourceError } from ${JSON.stringify(source)};
      globalThis.lithonoUrlSourceIdentity = publicError === sourceError;`,
  }, async root => {
    const result = await bundle(root) as { output: { type: string; code: string }[] };
    const code = result.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
    const globals = globalThis as typeof globalThis & { lithonoUrlSourceIdentity?: boolean };
    try {
      await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
      assert.equal(globals.lithonoUrlSourceIdentity, true);
    } finally { delete globals.lithonoUrlSourceIdentity; }
  });
});

test('Vite raw trio sources remain literal data and URL requests remain assets', async () => {
  await fixture({
    'entry.ts': `import ts from './src/components/example/example.ts?raw';
      import html from './src/components/example/example.html?raw';
      import url from './src/components/example/example.html?url';
      globalThis.rawSources = [ts, html, url];`,
    'src/components/example/example.ts': `export default class Example { /* source-only-marker */ }`,
    'src/components/example/example.html': '<button>${this.count}</button>',
  }, async root => {
    const result = (await bundle(root)) as { output: { type: string; code?: string }[] };
    const code = result.output.filter((item) => item.type === 'chunk').map((item) => item.code).join('\n');
    assert.match(code, /source-only-marker/);
    assert.match(code, /\$\{this.count\}/);
    assert.doesNotMatch(code, /prototype.render|defineFromFilename/);
  });
});

for (const extension of ['ts', 'js', 'mjs']) {
  for (const location of ['src/server/secret', 'src/pages/demo/page', 'src/shared/secret.server']) {
    const target = `${location}.${extension}`;
    test(`client build rejects transitive relative ${target}`, async () => {
      await fixture({
        'entry.ts': `import { secret } from './bridge.ts'; console.log(secret);`,
        'bridge.ts': `export { secret } from './${target}';`,
        [target]: `export const secret = 'server secret';`,
      }, async (root) => {
        await assert.rejects(bundle(root), (error: unknown) => {
          assert.match(String(error), /Lithono: server-only module imported in the client bundle/);
          assert.ok(String(error).includes(target));
          return true;
        });
      });
    });
  }
}

for (const specifier of ['lithono/server', 'lithono/auth', 'lithono/config', 'lithono/vite']) {
  test(`client build rejects transitive package import ${specifier}`, async () => {
    await fixture({
      'entry.ts': `import './bridge.ts';`,
      'bridge.ts': `import '${specifier}';`,
    }, async (root) => {
      await assert.rejects(bundle(root), /Lithono: server-only module imported in the client bundle/);
    });
  });
}

test('client build rejects an alias resolving to an extensionless server import', async () => {
  await fixture({
    'entry.ts': `import './bridge.ts';`,
    'bridge.ts': `import { secret } from '@private/secret'; console.log(secret);`,
    'src/server/secret.ts': `export const secret = 42;`,
  }, async (root) => {
    await assert.rejects(bundle(root, {
      resolve: { alias: { '@private': join(root, 'src/server') } },
    }), /Lithono: server-only module imported in the client bundle/);
  });
});

test('client build rejects dynamic server imports', async () => {
  await fixture({
    'entry.ts': `globalThis.loadSecret = () => import('./secret.server.mjs');`,
    'secret.server.mjs': `export const secret = 42;`,
  }, async (root) => {
    await assert.rejects(bundle(root), /Lithono: server-only module imported in the client bundle/);
  });
});

test('Vite eliminates type-only server imports and re-exports before boundary resolution', async () => {
  await fixture({
    'entry.ts': `import type { Secret } from './src/server/secret.ts';
      import { type LithonoConfig } from 'lithono/config';
      export type { RequestContext } from 'lithono/server';
      const value: Secret = { value: 42 }; console.log(value);`,
    'src/server/secret.ts': `export interface Secret { value: number }
      throw new Error('must never load');`,
  }, async (root) => {
    await bundle(root);
  });
});

test('browser root bundles without Node builtins, Vite, config, or adapters', async () => {
  await fixture({
    'entry.ts': `import * as lithono from 'lithono'; console.log(lithono);`,
  }, async (root) => {
    const result = await bundle(root);
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
    const modules = outputs.flatMap((item) => item.type === 'chunk' ? Object.keys(item.modules) : []);
    assert.ok(modules.some((id) => id.endsWith('/framework/index.ts')));
    assert.deepEqual(modules.filter((id) =>
      id.includes('__vite-browser-external') || id.startsWith('node:') ||
      /\/framework\/(config\.ts|vite\.ts|adapters\/)/.test(id) ||
      /\/node_modules\/vite\//.test(id)), []);
    const code = outputs.filter((item) => item.type === 'chunk').map((item) => item.code).join('\n');
    assert.ok(!code.includes('defineConfig'));
  });
});

test('SSR build permits transitive server modules', async () => {
  await fixture({
    'entry.ts': `export { secret } from './bridge.ts';`,
    'bridge.ts': `export { secret } from './src/server/secret.mjs';`,
    'src/server/secret.mjs': `export const secret = 42;`,
  }, async (root) => {
    await bundle(root, { build: { ssr: true, write: false,
      rolldownOptions: { input: join(root, 'entry.ts') } } });
  });
});

test('built sourcemaps retain page HTML and component trio HTML/TS sources', async () => {
  await fixture({
    'entry.ts': `import Page from './src/pages/demo/page.html';
      import Card from './src/components/demo-card.ts'; console.log(Page, Card);`,
    'src/pages/demo/page.html': `<p>page map marker</p>`,
    'src/components/demo-card.ts': `import { LithonoElement } from 'lithono/client';
      export default class Card extends LithonoElement { value = 'component map marker'; }`,
    'src/components/demo-card.html': `<p>trio map marker</p>`,
  }, async (root) => {
    const result = await bundle(root);
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
    const maps = outputs.flatMap((item) => item.type === 'chunk' && item.map ? [item.map] : []);
    for (const source of ['src/pages/demo/page.html', 'src/components/demo-card.html', 'src/components/demo-card.ts']) {
      assert.ok(maps.some((map) => map.sources.some((id) => id.endsWith(source))), source);
      assert.ok(maps.some((map) => map.sources.some((id, index) =>
        id.endsWith(source) && !!map.sourcesContent?.[index])), `${source} content`);
    }
  });
});
