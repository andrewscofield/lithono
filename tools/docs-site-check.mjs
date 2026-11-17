import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { root } from './docs-project.mjs';

const { articles } = await import(pathToFileURL(join(root, 'dist/server/_virtual/lithono-docs.js')).href);
const fixture = mkdtempSync(join(tmpdir(), 'lithono-doc-site-'));
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const server = spawn('node', ['dist/server/src/server.js'], { cwd: root, stdio: 'inherit', env: {
  ...process.env, NODE_ENV: 'production', PORT: String(port), LITHONO_DEMO_DATABASE: join(fixture, 'app.sqlite'), BETTER_AUTH_URL: origin,
} });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) throw new Error('Documentation production server exited');
    try { if ((await fetch(`${origin}/docs`)).ok) { ready = true; break; } } catch { /* wait */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready);
  const llms = await (await fetch(`${origin}/llms.txt`)).text();
  for (const article of articles) {
    assert.equal((await fetch(`${origin}/docs/${article.id}`)).status, 200, article.id);
    const response = await fetch(`${origin}/documentation/${article.id}.md`);
    assert.equal(response.status, 200, article.id);
    assert(response.headers.get('content-type').includes('text/markdown'));
    const markdown = await response.text();
    assert(markdown.startsWith(`# ${article.title}`));
    assert(!/```[^\n]*source="/.test(markdown), `${article.id} source fences must expand`);
    assert(llms.includes(`/documentation/${article.id}.md`));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage(); const errors = []; const modules = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.resourceType() === 'script') modules.push(request.url()); });
  await page.goto(`${origin}/docs/tutorial-database`);
  const copy = page.locator('docs-code').first().getByRole('button', { name: /Copy/ });
  await expect(copy).toBeEnabled();
  const code = await page.locator('docs-code pre code').first().textContent();
  await copy.click(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code);
  await page.locator('docs-shell').evaluate(node => { window.docsCompletionShell = node; });
  await page.getByRole('navigation', { name: 'Documentation', exact: true })
    .getByRole('link', { name: 'Tutorial 2 — accounts and private catalogs', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tutorial 2 — accounts and private catalogs');
  assert(await page.locator('docs-shell').evaluate(node => node === window.docsCompletionShell));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const article of articles) {
    await page.goto(`${origin}/docs/${article.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(article.title);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${article.id} overflows at 390px`);
  }
  await page.goto(`${origin}/docs/tutorial-receiving`);
  await page.screenshot({ path: join(fixture, 'tutorial-mobile.png'), fullPage: true });
  const native = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const reader = await native.newPage(); await reader.goto(`${origin}/docs/tutorial-receiving`);
    await expect(reader.locator('docs-code pre').filter({ hasText: "CREATE TRIGGER fail_receipt" })).toBeVisible();
    await reader.goto(`${origin}/docs`);
    await reader.getByRole('searchbox', { name: 'Search documentation' }).fill('atomic');
    await reader.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(reader.locator('.docs-card').filter({ hasText: 'Tutorial 4 — receive stock safely' })).toBeVisible();
  } finally { await native.close(); }
  assert(!modules.some(url => /shiki|oniguruma|remark|rehype/.test(url)));
  assert.deepEqual(errors, []);
  console.log(`Documentation site completion passed: ${articles.length} HTML/Markdown/llms entries, source expansion, copy, retained shell, all-article mobile layout, native search/content. Screenshot: ${join(fixture, 'tutorial-mobile.png')}`);
} finally {
  await browser?.close();
  if (server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill('SIGTERM'); });
}
