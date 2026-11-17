import { test, expect } from '@playwright/test';

declare global {
  interface Window { docsShell?: Element; docsDocument?: Document }
}

test('documentation arrives highlighted, copies exact source, and keeps its shell across article navigation', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  const modules: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.resourceType() === 'script') modules.push(request.url()); });
  const response = await page.goto('/docs/first-page');
  const html = await response!.text();
  expect(html).toContain('<docs-code>');
  expect(html).toContain('--shiki-light');
  expect(html).toContain('Your first page');
  await expect(page.locator('docs-code').first().getByRole('button', { name: /Copy/ })).toBeEnabled();
  const source = await page.locator('docs-code pre code').first().textContent();
  await page.locator('docs-code').first().getByRole('button', { name: /Copy/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
  await expect(page.locator('docs-code').first().getByRole('status')).toContainText('copied');
  await page.locator('docs-shell').evaluate(node => { window.docsShell = node; window.docsDocument = document; });
  await page.getByRole('navigation', { name: 'Documentation', exact: true }).getByRole('link', { name: 'Forms and validation', exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/forms$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Forms and validation');
  expect(await page.locator('docs-shell').evaluate(node => node === window.docsShell && document === window.docsDocument)).toBe(true);
  await expect(page.getByRole('navigation', { name: 'Documentation', exact: true }).getByRole('link', { name: 'Forms and validation', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('docs-code').first().getByRole('button', { name: /Copy/ })).toBeEnabled();
  await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Business conflicts are different from invalid input' }).click();
  await expect(page).toHaveURL(/#business-conflicts-are-different-from-invalid-input$/);
  expect(modules.some(url => /shiki|oniguruma|remark|rehype/.test(url))).toBe(false);
  expect(errors).toEqual([]);
});

test('Light Dark System preference survives navigation and reload with matching code colors', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/docs/first-page');
  const picker = page.getByRole('combobox', { name: 'Color theme' });
  await expect(picker).toBeEnabled();
  await picker.selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
  const light = await page.locator('docs-code pre span[style]').first().evaluate(node => getComputedStyle(node).color);
  await picker.selectOption('dark');
  const dark = await page.locator('docs-code pre span[style]').first().evaluate(node => getComputedStyle(node).color);
  expect(dark).not.toBe(light);
  await page.getByRole('navigation', { name: 'Documentation', exact: true }).getByRole('link', { name: 'Dark mode and theming', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(picker).toHaveValue('dark');
  await picker.selectOption('system');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
});

test('search, Markdown and mobile documentation work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/docs');
  await page.getByRole('searchbox', { name: 'Search documentation' }).fill('replay');
  await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Search results for/ })).toBeVisible();
  await page.locator('.docs-card').filter({ hasText: 'Receive stock and publish a book' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Receive stock and publish a book');
  await expect(page.locator('docs-code pre').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const markdown = await page.request.get('/documentation/receiving-stock.md');
  expect(markdown.headers()['content-type']).toContain('text/markdown');
  expect(await markdown.text()).toContain('catalog.receive(');
  expect(await (await page.request.get('/llms.txt')).text()).toContain('/documentation/receiving-stock.md');
  expect((await page.request.get('/documentation/not-an-article.md')).status()).toBe(404);
  await context.close();
});

test('mobile docs menu and theme palette render without overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/first-page');
  await expect(page.locator('docs-shell')).toHaveJSProperty('localName', 'docs-shell');
  await page.waitForFunction(() => !!customElements.get('docs-shell'));
  const toggle = page.getByRole('button', { name: 'Documentation menu' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();
  await toggle.click();
  await page.getByRole('combobox', { name: 'Color theme' }).selectOption('dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('docs-mobile-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('combobox', { name: 'Color theme' }).selectOption('light');
  await page.screenshot({ path: testInfo.outputPath('docs-desktop-light.png'), fullPage: true });
});
