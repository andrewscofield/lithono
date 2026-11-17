import { test, expect } from '@playwright/test';

test('showcase is honest, linked to working demos and responsive without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const response = await page.goto('http://127.0.0.1:4197/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Useful pages. Purposeful components.' })).toBeVisible();
  await expect(page.locator('.demo-card')).toHaveCount(7);
  await expect(page.locator('.demo-card .status-label').filter({ hasText: /^Planned/ })).toHaveCount(0);
  await expect(page.getByText(/current SSR path buffers/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const targets = await page.locator('a[href]').evaluateAll(links =>
    [...new Set(links.map(link => link.getAttribute('href')!).filter(href => href.startsWith('/')))],
  );
  expect(targets.sort()).toEqual(['/', '/bookstore', '/community', '/components', '/dashboard', '/docs', '/inventory', '/lab', '/listings', '/lists', '/login', '/workshops']);
  for (const target of targets) {
    const result = await page.request.get(target);
    expect(result.status(), target).toBe(200);
  }
  await page.getByRole('link', { name: 'Open simple lists', exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
  await page.goto('http://127.0.0.1:4197/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
