import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    awesomeClicks: number;
    originalHosts: Element[];
    originalFallback: Element | null;
    originalLightButton: Element | null;
    originalShadowButton: Element | null;
  }
}

test('generated graphs hydrate interop independently and preserve component ownership', async ({ page }) => {
  const errors: string[] = [];
  const diagnostics: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
  let allowDelayed!: () => void;
  const unusedRequests: string[] = [];
  page.on('request', request => { if (/unused-element|external\/unused\.mjs/.test(request.url())) unusedRequests.push(request.url()); });
  const delayedGate = new Promise<void>(resolve => { allowDelayed = resolve; });
  await page.route('**/external/delayed.mjs*', async route => { await delayedGate; await route.continue(); });
  await page.goto('/interop', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('light-element button')).toHaveText('light 0');
  await expect(page.locator('light-element')).not.toHaveAttribute('defer-hydration');
  await expect(page.locator('lithono-page-interop')).not.toHaveAttribute('defer-hydration');
  await expect(page.locator('header')).toHaveText('layout boot state');
  await expect(page.locator('h1')).toHaveText('shared route state');
  await expect(page.locator('light-element output')).toHaveText('shared route state');
  await expect(page.locator('js-element')).toHaveAttribute('data-upgraded', 'js');
  await expect(page.locator('mjs-element')).toHaveAttribute('data-upgraded', 'mjs');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => customElements.get('delayed-element') === undefined)).toBe(true);
  await expect(page.locator('#fallback')).toHaveText('delayed fallback');
  allowDelayed();
  await page.locator('light-element button').click();
  await page.locator('external-shadow button').click();
  await expect(page.locator('light-element button')).toHaveText('light 1');
  await expect(page.locator('external-shadow button')).toHaveText('shadow 1');
  await expect(page.locator('delayed-element output')).toHaveText('before upgrade');
  await expect(page.locator('#fallback')).toHaveText('delayed fallback');
  await expect(page.locator('#failed-fallback')).toHaveText('failed fallback');
  await expect(page.locator('wa-button')).not.toHaveAttribute('defer-hydration');
  await expect(page.locator('wa-button button')).toBeVisible();
  await page.locator('wa-button').evaluate(el => {
    window.awesomeClicks = 0;
    el.addEventListener('click', () => window.awesomeClicks++);
  });
  await page.locator('wa-button button').click();
  expect(await page.evaluate(() => window.awesomeClicks)).toBe(1);
  expect(await page.evaluate(() => {
    const w = window;
    return w.originalHosts.every((el: Element) => el.isConnected) &&
      w.originalFallback === document.querySelector('#fallback') &&
      w.originalLightButton === document.querySelector('light-element button') &&
      w.originalShadowButton === document.querySelector('external-shadow')!.shadowRoot!.querySelector('button');
  })).toBe(true);
  expect(errors).toEqual([]);
  await expect.poll(() => diagnostics.some(message => message.includes('failed to load client element module /@lithono/elements/failed-element'))).toBe(true);
  expect(await page.evaluate(() => customElements.get('slow-element') === undefined)).toBe(true);
  expect(unusedRequests).toEqual([]);
});

test('catalog entries stay lazy on unrelated routes and normal trio registration imports work without mappings', async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/plain');
  await expect(page.locator('ordinary-import button')).toHaveText('ordinary 0');
  await expect(page.locator('lithono-page-plain')).not.toHaveAttribute('defer-hydration');
  await expect(page.locator('ordinary-import')).not.toHaveAttribute('defer-hydration');
  expect(errors).toEqual([]);
  await page.locator('ordinary-import button').click();
  await expect(page.locator('ordinary-import button')).toHaveText('ordinary 1');
  expect(requests.filter(url => url.includes('/@lithono/elements/') || /external\/(?:delayed|failed|slow|unused|shadow)\.mjs|webawesome/.test(url))).toEqual([]);
  expect(await page.evaluate(() => ['wa-button', 'external-shadow', 'delayed-element', 'unused-element'].map(tag => !!customElements.get(tag)))).toEqual([false, false, false, false]);
  const selected = await page.locator('#__LITHONO_DATA__').evaluate(el => JSON.parse(el.textContent!).elements as string[]);
  expect(selected.filter(id => id.startsWith('/@lithono/elements/'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('without JavaScript, SSR light/shadow content and browser-only fallback remain readable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4181/interop');
  await expect(page.locator('light-element button')).toHaveText('light 0');
  await expect(page.locator('external-shadow button')).toHaveText('shadow 0');
  await expect(page.locator('wa-button')).toHaveText('Web Awesome');
  await expect(page.locator('#fallback')).toHaveText('delayed fallback');
  await expect(page.locator('#failed-fallback')).toHaveText('failed fallback');
  await context.close();
});

test('late mapped tags load on insertion once and a failed sibling leaves native fallback intact', async ({ page }) => {
  const diagnostics: string[] = [];
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/plain');
  await expect(page.locator('ordinary-import button')).toHaveText('ordinary 0');
  expect(await page.evaluate(() => !!customElements.get('external-shadow'))).toBe(false);
  await page.evaluate(() => {
    const failed = document.createElement('failed-element');
    failed.textContent = 'Late native fallback';
    document.body.append(failed, document.createElement('external-shadow'));
  });
  await expect(page.locator('external-shadow button')).toHaveText('shadow 0');
  await page.locator('external-shadow button').click();
  await expect(page.locator('external-shadow button')).toHaveText('shadow 1');
  await expect(page.locator('failed-element')).toHaveText('Late native fallback');
  await expect.poll(() => diagnostics.filter(message => message.includes('failed to load mapped element failed-element')).length).toBe(1);
  await page.evaluate(() => {
    const shadow = document.querySelector('external-shadow')!;
    shadow.remove(); document.body.append(shadow);
    document.body.append(document.createElement('failed-element'));
  });
  await expect(page.locator('external-shadow button')).toHaveText('shadow 1');
  expect(diagnostics.filter(message => message.includes('failed to load mapped element failed-element'))).toHaveLength(1);
  expect(errors).toEqual([]);
});
