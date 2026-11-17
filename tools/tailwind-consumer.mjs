import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

export function prepareTailwind(app, run) {
  run('pnpm', ['add', '-D', 'tailwindcss@^4.3.0', '@tailwindcss/vite@^4.3.0'], app);
  writeFileSync(join(app, 'lithono.config.ts'), `import { defineConfig, node } from 'lithono/config';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ adapter: node(), inline: 'none', vite: { plugins: [tailwindcss()] } });
`);
  writeFileSync(join(app, 'src/pages/layout.html'), '<header><a href="/">Home</a> <a href="/tailwind">Tailwind route</a></header><slot></slot>');
  writeFileSync(join(app, 'src/pages/layout.css'), `@import "tailwindcss" source("../");
@custom-variant dark {
  &:where([data-theme=dark], [data-theme=dark] *) { @slot; }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme=light]), :root:not([data-theme=light]) *) { @slot; }
  }
}
`);
  const page = join(app, 'src/pages/page.html');
  writeFileSync(page, readFileSync(page, 'utf8').replace('<main>', '<main class="p-8 bg-white dark:bg-black" data-tailwind-page>') + '<tailwind-probe></tailwind-probe>');
  mkdirSync(join(app, 'src/pages/tailwind'), { recursive: true });
  writeFileSync(join(app, 'src/pages/tailwind/page.html'), '<h1 class="text-3xl font-bold" data-tailwind-heading>Tailwind destination</h1><a href="/">Return home</a>');
  mkdirSync(join(app, 'src/components/tailwind-probe'), { recursive: true });
  writeFileSync(join(app, 'src/components/tailwind-probe/tailwind-probe.ts'), `import { html, LithonoElement } from 'lithono/client';
import { customElement } from 'lit/decorators.js';
@customElement('tailwind-probe')
export default class TailwindProbe extends LithonoElement {
  static root = 'light' as const;
  render() { return html\`<p class="py-7" data-ts-utility>TypeScript source utility</p>\`; }
}
`);
}

async function waitForServer(url, server) {
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error('Tailwind consumer server exited');
    try { if ((await fetch(url)).ok) return; } catch { /* wait for startup */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Tailwind consumer server did not start: ${url}`);
}

export async function verifyTailwind(app, production = false) {
  const port = production ? 4194 : 4195;
  const url = `http://127.0.0.1:${port}`;
  const server = production
    ? spawn('node', ['dist/server/src/server.js'], { cwd: app, env: { ...process.env, NODE_ENV: 'production', PORT: String(port) }, stdio: 'inherit' })
    : spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: app, stdio: 'inherit', detached: true });
  let browser;
  try {
    await waitForServer(url, server);
    const response = await fetch(url);
    assert.match(await response.text(), /class="p-8 bg-white dark:bg-black"/);
    browser = await chromium.launch();
    const page = await browser.newPage({ colorScheme: 'light' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-tailwind-page]')).paddingTop === '32px');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-ts-utility]')).paddingTop === '28px');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-tailwind-page]')).backgroundColor === 'rgb(0, 0, 0)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-tailwind-page]')).backgroundColor === 'rgb(255, 255, 255)');
    await page.evaluate(() => { delete document.documentElement.dataset.theme; });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-tailwind-page]')).backgroundColor === 'rgb(0, 0, 0)');
    await page.evaluate(() => { window.retainedDocument = document; });
    await page.getByRole('link', { name: 'Tailwind route', exact: true }).click();
    await page.getByRole('heading', { name: 'Tailwind destination' }).waitFor();
    assert.equal(await page.locator('[data-tailwind-heading]').evaluate(node => getComputedStyle(node).fontSize), '30px');
    assert.equal(await page.evaluate(() => document === window.retainedDocument), true);
    await page.getByRole('link', { name: 'Return home', exact: true }).click();
    await page.locator('[data-tailwind-page]').waitFor();
    if (!production) {
      const file = join(app, 'src/pages/page.html');
      const original = readFileSync(file, 'utf8');
      try {
        writeFileSync(file, original.replace('class="p-8 ', 'class="p-8 px-9 '));
        // Lithono intentionally omits Vite's injected browser client; request the
        // updated document rather than depending on an automatic full reload.
        await new Promise(resolve => setTimeout(resolve, 250));
        await page.reload();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-tailwind-page]')).paddingLeft === '36px');
      } finally { writeFileSync(file, original); }
    }
    assert.deepEqual(errors, []);
    console.log(`Tailwind ${production ? 'production' : 'development'} consumer passed: HTML/TS sources, SSR, theme variants, client navigation${production ? '' : ', source updates'}.`);
  } finally {
    await browser?.close();
    if (production) server.kill('SIGTERM');
    else { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } }
  }
}
