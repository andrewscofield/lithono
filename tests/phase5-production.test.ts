import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'vite';
import { lithono, lithonoViteConfig } from '../src/framework/vite.ts';
import { applyAdapter, cloudflare } from '../src/framework/adapters/index.ts';
import { discoverRoutes } from '../src/framework/server/routes.ts';
import { loadLithonoConfig } from '../src/framework/config.ts';
import { execFileSync } from 'node:child_process';

test('unsupported adapters and explicit prerender fail; static discovery does not claim prerender', () => {
  assert.throws(() => applyAdapter({}, cloudflare()), /cloudflare is experimental and unsupported/);
  assert.throws(() => applyAdapter({}, { name: 'unknown' }), /unsupported/);
  assert.throws(() => discoverRoutes({ '/src/pages/page.ts': { prerender: true } }), /prerender.*experimental and unsupported/);
  assert.equal(discoverRoutes({ '/src/pages/page.ts': {} })[0].prerender, false);
});

test('production readability and source maps survive inline build overrides', async () => {
  const config = await lithonoViteConfig({ build: { minify: true, cssMinify: true, sourcemap: false }, environments: { client: { build: { minify: true, cssMinify: true, sourcemap: false } } } })({ command: 'build', mode: 'production' });
  for (const build of [config.build, config.environments?.client?.build, config.environments?.ssr?.build]) {
    assert.equal(build?.minify, false);
    assert.equal(build?.cssMinify, false);
    assert.equal(build?.sourcemap, true);
  }
  assert.ok(!config.environments?.client?.resolve?.conditions?.includes('development'));
});

test('preserved server raw-source modules have Node-importable filenames and literal contents', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lithono-phase5-raw-'));
  try {
    const config = await lithonoViteConfig()({ command: 'build', mode: 'production' });
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    writeFileSync(join(root, 'entry.ts'), `import source from './source.ts?raw'; import html from './source.html?raw'; import css from './source.css?raw'; console.log(JSON.stringify([source, html, css]));`);
    writeFileSync(join(root, 'source.ts'), 'export const literal = 42;');
    writeFileSync(join(root, 'source.html'), '<p>${this.literal}</p>');
    writeFileSync(join(root, 'source.css'), 'p { color: red; }');
    const output = config.environments!.ssr!.build!.rolldownOptions!.output as object;
    await build({ root, configFile: false, logLevel: 'silent', plugins: [lithono({})], build: {
      ssr: true, outDir: join(root, 'out'), rolldownOptions: { input: join(root, 'entry.ts'), output: { ...output, preserveModulesRoot: root } },
    } });
    const result = execFileSync(process.execPath, [join(root, 'out/entry.js')], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(result), ['export const literal = 42;', '<p>${this.literal}</p>', 'p { color: red; }']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('broken build configuration fails instead of silently deploying defaults', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lithono-phase5-config-'));
  try {
    writeFileSync(join(root, 'lithono.config.js'), 'throw new Error("invalid build configuration");');
    await assert.rejects(loadLithonoConfig(root, { command: 'build', mode: 'production' }), /Failed to load config/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('preserved server mapped modules have contained Node filenames and client-only imports stay lazy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lithono-phase5-mapped-'));
  try {
    const config = await lithonoViteConfig()({ command: 'build', mode: 'production' });
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    writeFileSync(join(root, 'entry.ts'), `import { elementModules } from 'virtual:lithono-elements'; console.log(JSON.stringify(Object.keys(elementModules)));`);
    writeFileSync(join(root, 'browser.ts'), 'throw new Error("Browser-only registration executed on server");');
    const output = config.environments!.ssr!.build!.rolldownOptions!.output as object;
    await build({ root, configFile: false, logLevel: 'silent', plugins: [lithono({ elements: {
      'browser-control': { import: './browser.ts', mode: 'client-only' },
    } })], build: { ssr: true, outDir: join(root, 'out'), rolldownOptions: {
      input: join(root, 'entry.ts'), output: { ...output, preserveModulesRoot: root },
    } } });
    const result = execFileSync(process.execPath, [join(root, 'out/entry.js')], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(result), ['/@lithono/elements/browser-control']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('readable Lit and hydration support stay compatible without global development exports', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lithono-phase5-conditions-'));
  try {
    mkdirSync(join(root, 'node_modules'));
    for (const name of ['lit', 'lit-html', 'lit-element', '@lit', '@lit-labs']) {
      symlinkSync(fileURLToPath(new URL(`../node_modules/${name}`, import.meta.url)), join(root, 'node_modules', name), 'dir');
    }
    const dependency = join(root, 'node_modules', 'conditional-dependency');
    mkdirSync(dependency);
    writeFileSync(join(dependency, 'package.json'), JSON.stringify({ type: 'module', exports: { development: './dev.js', default: './prod.js' } }));
    writeFileSync(join(dependency, 'dev.js'), 'export const marker = "unrelated-development-branch";');
    writeFileSync(join(dependency, 'prod.js'), 'export const marker = "unrelated-production-branch";');
    writeFileSync(join(root, 'entry.ts'), 'import { LitElement } from "lit"; import "@lit-labs/ssr-client/lit-element-hydrate-support.js"; import { marker } from "conditional-dependency"; console.log(LitElement, marker);');
    const result = await build({ root, configFile: false, logLevel: 'silent', plugins: [lithono({})], build: { write: false, minify: false, rolldownOptions: { input: join(root, 'entry.ts') } } });
    const code = (Array.isArray(result) ? result : [result]).flatMap((result) => result.output).filter((output) => output.type === 'chunk').map((output) => output.code).join('\n');
    assert.match(code, /unrelated-production-branch/);
    assert.doesNotMatch(code, /unrelated-development-branch/);
    assert.match(code, /ReactiveElement = class extends HTMLElement/);
    assert.match(code, /Lit is in dev mode/);
    assert.match(code, /development\/lit-element-hydrate-support/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
