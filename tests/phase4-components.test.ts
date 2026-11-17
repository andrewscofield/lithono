import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { lithono } from '../src/framework/vite.ts';
import { buildElementRegistry, registerServerElements } from '../src/framework/server/elements.ts';
import { tagFromModuleId, isClientOnlyModule } from '../src/framework/element-id.ts';

test('explicit client-only mapping overrides inferred SSR ownership and is never imported on server', async () => {
  let loads = 0;
  const registry = buildElementRegistry({
    '/src/components/external-tag.ts': async () => { throw new Error('inferred module must be overridden'); },
    '/@lithono/elements/external-tag': Object.assign(async () => { loads++; }, { tag: 'external-tag', clientOnly: true }),
  });
  await registerServerElements(registry);
  assert.equal(loads, 0);
  assert.equal(registry.get('external-tag')?.id, '/@lithono/elements/external-tag');
  assert.equal(tagFromModuleId('/src/components/vanilla-tag.client.mjs'), 'vanilla-tag');
  assert.equal(isClientOnlyModule('/src/components/vanilla-tag.client.js'), true);
});

test('server registration failure identifies the claimed tag/import, preserves cause, and rejects startup', async () => {
  const cause = new Error('window is not defined');
  const registry = buildElementRegistry({
    '/@lithono/elements/broken-tag': Object.assign(async () => { throw cause; }, { tag: 'broken-tag', clientOnly: false }),
  });
  await assert.rejects(registerServerElements(registry), (error: Error) => {
    assert.match(error.message, /<broken-tag>.*\/@lithono\/elements\/broken-tag/);
    assert.match(error.message, /client-only/);
    assert.equal(error.cause, cause);
    return true;
  });
});

test('successful import without configured registration is an explicit server error', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
  Object.defineProperty(globalThis, 'customElements', { configurable: true, value: { get: () => undefined } });
  try {
    const registry = buildElementRegistry({
      '/@lithono/elements/missing-tag': Object.assign(async () => ({}), { tag: 'missing-tag', clientOnly: false }),
    });
    await assert.rejects(registerServerElements(registry), /did not register configured element <missing-tag>/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'customElements', original);
    else Reflect.deleteProperty(globalThis, 'customElements');
  }
});

test('production client graph bundles actual Web Awesome, external SSR element and discovered JS/MJS', async () => {
  const root = fileURLToPath(new URL('./phase4-interop/', import.meta.url));
  const result = await build({
    root, configFile: false, logLevel: 'silent',
    plugins: [lithono({ elements: {
      'wa-button': { import: '@awesome.me/webawesome/dist/components/button/button.js', mode: 'client-only' },
      'external-shadow': { import: './external/shadow.mjs', mode: 'ssr' },
    } })],
    build: { write: false, minify: false, rolldownOptions: { input: fileURLToPath(new URL('../src/framework/client/bootstrap.ts', import.meta.url)) } },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const modules = outputs.flatMap(item => item.type === 'chunk' ? Object.keys(item.modules) : []);
  for (const suffix of ['/button/button.js', '/external/shadow.mjs', '/js-element.client.js', '/mjs-element.client.mjs']) {
    assert.ok(modules.some(id => id.endsWith(suffix)), suffix);
  }
  const code = outputs.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
  assert.ok(code.includes('/@lithono/elements/wa-button'));
  assert.ok(!modules.some(id => id.includes('__vite-browser-external')));
});
