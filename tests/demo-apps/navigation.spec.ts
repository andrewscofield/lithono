import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    navigationSentinel?: object;
    retainedHeader?: Element | null;
    retainedFilter?: Element;
  }
}

test('a slow obsolete route cannot replace a newer route', async ({ page }) => {
  await page.goto('/listings');
  await page.waitForFunction(() => customElements.get(document.querySelector('[data-lithono-page]')!.localName));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/components', async route => {
    await gate;
    await route.continue().catch(() => {});
  });
  const requested = page.waitForRequest(request => new URL(request.url()).pathname === '/components');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Components', exact: true }).click();
  await requested;
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Community', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Community publication' })).toBeVisible();
  release();
  await expect(page).toHaveURL(/\/community$/);
  await expect(page.getByRole('heading', { name: 'Community publication' })).toBeVisible();
});

test('route navigation retains the document and shared shell, loads previews automatically, and restores history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const missing: string[] = [];
  page.on('response', response => { if (response.status() === 404) missing.push(response.url()); });
  await page.goto('/listings');
  await page.waitForFunction(() => customElements.get(document.querySelector('[data-lithono-page]')!.localName));
  await page.evaluate(() => {
    Object.assign(window, { navigationSentinel: {}, retainedHeader: document.querySelector('.site-header') });
  });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Components', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Component directory', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Web Awesome switch', exact: false }).click();
  await expect(page.locator('preview-host [role="status"]')).toContainText('Preview ready');
  await expect(page.locator('[data-activate]')).toBeHidden();
  const toggle = page.getByRole('switch', { name: 'Enable notifications' });
  await expect(toggle).toBeVisible();
  expect(await page.locator('wa-switch').evaluate(el => el.shadowRoot!.querySelector('.switch')!.getBoundingClientRect().width)).toBeGreaterThan(20);
  await page.locator('wa-switch').click();
  await expect(page.locator('preview-host output')).toHaveText('Notifications are on');
  await toggle.press('Space');
  await expect(page.locator('preview-host output')).toHaveText('Notifications are off');
  await expect(page.locator('.source-code [style*="--shiki-light"]')).not.toHaveCount(0);
  expect(await page.evaluate(() => Boolean(window.navigationSentinel) && window.retainedHeader === document.querySelector('.site-header'))).toBe(true);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Component directory', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('switch', { name: 'Enable notifications' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(missing).toEqual([]);
});

test('GET filtering updates server data and URL without replacing the document, shell, or form', async ({ page }) => {
  await page.goto('/community');
  await page.waitForFunction(() => customElements.get(document.querySelector('[data-lithono-page]')!.localName));
  const form = page.locator('form[method="get"]');
  await form.evaluate(el => { Object.assign(window, { retainedFilter: el }); });
  await page.getByRole('combobox', { name: 'Topic' }).selectOption('events');
  await page.getByRole('button', { name: 'Filter publication' }).click();
  await expect(page).toHaveURL(/topic=events/);
  await expect(page.getByRole('link', { name: 'A useful native web' })).toHaveCount(0);
  expect(await form.evaluate(el => window.retainedFilter === el)).toBe(true);
  await page.goBack();
  await expect(page.getByRole('link', { name: 'A useful native web' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Topic' })).toHaveValue('');
});

test('anonymous discount displays an actionable error without an unhandled rejection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/listings');
  await page.locator('.card-list h2 a').first().click();
  await page.getByRole('button', { name: 'Apply $10,000 discount', exact: true }).click();
  await expect(page.locator('listing-price [role="status"]')).toContainText('Sign in');
  await expect(page.getByRole('button', { name: 'Apply $10,000 discount', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('directory search and highlighted source fit desktop and mobile viewports', async ({ page }, testInfo) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/components');
    await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`directory-${width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Shadow counter', exact: false }).click();
    await expect(page.getByRole('button', { name: 'Shadow count: 0' })).toBeVisible();
    await page.locator('summary').filter({ hasText: /^previews\/shadow\.ts$/ }).click();
    await expect(page.locator('details code')).toContainText('extends LitElement');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`component-${width}.png`), fullPage: true });
  }
});
