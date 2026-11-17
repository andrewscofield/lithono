import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createProject, projects, root, run } from './docs-project.mjs';
import { verifySimple, verifyBookstore, verifyAPI } from './docs-example-checks.mjs';

const fixture = mkdtempSync(join(tmpdir(), 'lithono-doc-checkpoints-'));
for (const name of ['lithono', 'create-lithono']) run('pnpm', ['--reporter=silent', 'pack', '--pack-destination', fixture], join(root, 'packages', name));

async function start(app, databasePath) {
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn('node', ['dist/server/src/server.js'], { cwd: app, stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port),
      BETTER_AUTH_SECRET: 'documentation-fixture-secret-at-least-thirty-two-characters', BETTER_AUTH_URL: origin,
      CHAPTER_HOUSE_DATABASE: databasePath } });
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) throw new Error('Checkpoint server exited');
    try { if ((await fetch(origin)).ok) return { origin, stop: () => new Promise(resolve => { server.once('exit', resolve); server.kill('SIGTERM'); }) }; } catch { /* wait */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  server.kill('SIGTERM');
  throw new Error('Checkpoint server did not start');
}

const browser = await chromium.launch();
try {
  const selected = process.argv.slice(2);
  for (const name of selected.length ? selected : Object.keys(projects)) {
    const app = createProject(name, join(fixture, name), fixture);
    assert.deepEqual(JSON.parse(readFileSync(join(app, 'tsconfig.json'), 'utf8')).compilerOptions.paths, { '@/*': ['./src/*'] });
    for (const command of ['typecheck', 'check', ...(existsSync(join(app, 'tests')) ? ['test'] : [])]) run('pnpm', [command], app);
    run('pnpm', ['build', '--logLevel', 'warn'], app);
    const database = join(fixture, `${name}.sqlite`);
    const server = await start(app, database);
    let publicPath;
    try {
      if (name.startsWith('bookstore-')) publicPath = await verifyBookstore(name, server.origin, browser);
      else if (name === 'api-lifecycle') await verifyAPI(server.origin, browser);
      else await verifySimple(name, server.origin, browser);
    } finally { await server.stop(); }
    if (name === 'bookstore-publishing') {
      const deploy = join(fixture, 'copied-deployment'); mkdirSync(deploy);
      for (const file of ['dist', 'node_modules', 'package.json', 'pnpm-lock.yaml']) cpSync(join(app, file), join(deploy, file), { recursive: true });
      assert(!existsSync(join(deploy, 'src')));
      const copied = await start(deploy, database);
      try {
        const response = await fetch(`${copied.origin}${publicPath}`);
        assert.equal(response.status, 200);
        const html = await response.text(); assert.match(html, /\$23\.99/); assert.match(html, /7 copies in stock/);
        const page = await browser.newPage();
        try {
          const errors = []; page.on('pageerror', error => errors.push(error.message));
          await page.goto(`${copied.origin}${publicPath}`);
          await expect(page.getByRole('heading', { name: 'The Connected Bookshop', exact: true })).toBeVisible();
          await page.goto(`${copied.origin}/login`);
          await page.getByLabel('Email', { exact: true }).fill('bookstore-publishing-true@example.test');
          await page.getByLabel('Password', { exact: true }).fill('chapter-house-password');
          await page.getByRole('button', { name: 'Sign in', exact: true }).click();
          await expect(page).toHaveURL(`${copied.origin}/admin`);
          await page.getByRole('link', { name: 'The Connected Bookshop', exact: true }).click();
          await expect(page.getByText(/7 copies on hand/)).toBeVisible();
          assert.deepEqual(errors, []);
        }
        finally { await page.close(); }
      } finally { await copied.stop(); }
    }
    console.log(`Documentation checkpoint passed: ${name} (packed install, strict declarations, templates, domain rules, production SSR and browser).`);
  }
} finally { await browser.close(); }
