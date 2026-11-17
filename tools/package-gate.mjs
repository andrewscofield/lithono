import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { prepareTailwind, verifyTailwind } from './tailwind-consumer.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'lithono-package-'));
function run(command, args, cwd = temp) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`);
}
for (const pkg of ['lithono', 'create-lithono']) {
  run('pnpm', ['pack', '--pack-destination', temp], join(root, 'packages', pkg));
}
const tarball = (name) => join(temp, readdirSync(temp).find((file) => file.startsWith(`${name}-0.`) && file.endsWith('.tgz')));
// Exercise the packed scaffolder, not its source or an in-workspace template.
run('pnpm', ['dlx', tarball('create-lithono'), 'app']);
const app = join(temp, 'app');
const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
manifest.dependencies.lithono = `file:${tarball('lithono')}`;
manifest.dependencies.lit = process.env.LITHONO_TEST_LIT ?? '3.3.3';
writeFileSync(join(app, 'package.json'), JSON.stringify(manifest, null, 2));
run('pnpm', ['install', '--strict-peer-dependencies'], app);
if (process.env.LITHONO_TEST_TAILWIND) prepareTailwind(app, run);
const compilerOptions = JSON.parse(readFileSync(join(app, 'tsconfig.json'), 'utf8')).compilerOptions;
// The only mapping is application-owned; framework imports must use package exports.
assert.deepEqual(compilerOptions.paths, { '@/*': ['./src/*'] });
writeFileSync(join(app, 'src/consumer-types.ts'), `
import { definePostAction, type RequestContext, type Locals } from 'lithono';
import type { LithonoAppOptions, LithonoAuthOptions } from 'lithono/server';
import type { LithonoConfig } from 'lithono/config';
import type { LithonoElement } from 'lithono/client';
import * as url from 'lithono/url';
import * as webmcp from 'lithono/webmcp';
declare module 'lithono' { interface Locals { db: { name: string } } }
const loader = (ctx: RequestContext): string => ctx.db.name;
const action = definePostAction({ run: (ctx) => ctx.db.name });
const locals: Locals = { db: { name: 'consumer' } };
const auth: LithonoAuthOptions = { publicUser: () => null, publicSession: (ctx) => ({ label: ctx.db.name }) };
const options: LithonoAppOptions = { locals: () => locals, auth };
const config: LithonoConfig = { inline: 'styles' };
export { loader, action, options, config, url, webmcp };
export type Element = LithonoElement;
`);
run('pnpm', ['typecheck'], app);
// No TS runtime loader and no optional integrations installed.
run('node', ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  for (const name of ['lithono', 'lithono/client', 'lithono/server', 'lithono/config', 'lithono/url', 'lithono/vite', 'lithono/webmcp']) {
    const mod = await import(name); assert(Object.keys(mod).length > 0);
  }
  for (const name of ['better-auth', 'animejs']) {
    assert.throws(() => import.meta.resolve(name), { code: 'ERR_MODULE_NOT_FOUND' });
  }
`], app);
run('pnpm', ['exec', 'lithono', 'generate', 'gate-element'], app);
run('pnpm', ['check'], app);
// The generated starter imports @/lib/starter.ts from both server and browser code.
// Verify the distribution's default alias in dev as well as the production checks below.
const development = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', '4193', '--strictPort'], { cwd: app, stdio: 'inherit', detached: true });
let developmentBrowser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (development.exitCode !== null) throw new Error('Starter development server exited');
    try { if ((await fetch('http://127.0.0.1:4193')).ok) { ready = true; break; } } catch { /* wait */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Starter development server did not start');
  const response = await fetch('http://127.0.0.1:4193');
  assert.match(await response.text(), /Welcome to Lithono/);
  developmentBrowser = await chromium.launch();
  const page = await developmentBrowser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4193');
  await page.getByRole('button', { name: 'Count: 0', exact: true }).click();
  await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Starter development passed: aliased server loader, shared module, and browser component.');
} finally {
  await developmentBrowser?.close();
  try { process.kill(-development.pid, 'SIGTERM'); } catch { development.kill('SIGTERM'); }
}
if (process.env.LITHONO_TEST_TAILWIND) await verifyTailwind(app);
run('pnpm', ['build'], app);
if (process.env.LITHONO_TEST_TAILWIND) await verifyTailwind(app, true);
// Browser-safe root, URL, and WebMCP entries must bundle under the browser platform.
writeFileSync(join(app, 'browser-root.js'), "import * as root from 'lithono'; import * as url from 'lithono/url'; import * as webmcp from 'lithono/webmcp'; export { root, url, webmcp };\n");
run('node', ['--input-type=module', '-e', `
  import { build } from 'vite';
  await build({ configFile: false, build: { outDir: 'dist/client/assets', emptyOutDir: false,
    lib: { entry: 'browser-root.js', formats: ['es'], fileName: () => 'gate-root.js' } } });
`], app);
const server = spawn('node', ['dist/server/src/server.js'], { cwd: app, env: { ...process.env, NODE_ENV: 'production', PORT: '4196' }, stdio: 'inherit' });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://127.0.0.1:4196')).ok) break; } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const response = await fetch('http://127.0.0.1:4196');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Welcome to Lithono/);
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4196');
  assert.equal(await page.evaluate(async () => {
    const { root, url, webmcp } = await import('/assets/gate-root.js');
    return typeof root.definePostAction === 'function' && Object.keys(url).length > 0 && typeof webmcp.defineWebMcpTool === 'function';
  }), true);
  await page.getByRole('button', { name: 'Count: 0' }).click();
  await page.getByRole('button', { name: 'Count: 1' }).waitFor();
  assert.deepEqual(errors, []);
  console.log(`Package gate passed: compiled imports, strict declarations + Locals, CLI assets, @/ imports in development and production, starter build, Node SSR and Chromium hydration (Lit ${manifest.dependencies.lit}). Consumer: ${app}`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
