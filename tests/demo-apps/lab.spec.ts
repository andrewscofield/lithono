import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    labDraft?: Element;
  }
}

test('native docs and lab form baseline, source manifest and generated compiler facts', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  await page.goto('/docs'); await expect(page.locator('script[src]')).toHaveCount(1);
  for (const path of ['getting-started','routing','loaders-actions','forms','url-state','components','rendering','deployment','migration']) {
    expect((await page.request.get(`/docs/${path}`)).status()).toBe(200);
  }
  await page.goto('/docs/lab-source'); await expect(page.locator('script[src]')).toHaveCount(1);
  await expect(page.locator('docs-code').filter({ has: page.getByText('Public lab route module', { exact: true }) }).locator('code')).toContainText('export const actions');
  const generated = page.locator('docs-code').filter({ has: page.getByText('Generated client template module (current compiler, before bundling)', { exact: true }) });
  await expect(generated.locator('code')).toContainText('lab-controls');
  await expect(generated.locator('code')).toContainText('export const hydrate = true');
  expect((await page.request.get('/docs/not-a-source?path=/etc/passwd')).status()).toBe(404);
  await page.goto('/lab'); await expect(page.getByLabel('Local identity draft')).toBeVisible();
  await page.getByLabel('Lab sample').selectOption('second'); await page.getByRole('button', { name: 'Change sample' }).click(); await expect(page.getByText('URL consumer one: second')).toBeVisible();
  await page.getByLabel('Always-native message').fill('Native proof'); await page.getByRole('button', { name: 'Validate native echo' }).click(); await expect(page.getByText('Validated echo: Native proof')).toBeVisible(); await context.close();
});
test('lab SSR identity, shared URL consumers/history, slow failed imports and ordinary/mapped elements', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/lab?campaign=retained'); await expect(page.locator('[defer-hydration]')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => !!customElements.get('lab-controls'))).toBe(true);
  await page.locator('lab-controls').evaluate(async node => { await (node as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete; });
  const draft = page.getByLabel('Local identity draft'); await draft.fill('Local draft'); await draft.evaluate(node => { window.labDraft = node; });
  await page.getByRole('button', { name: 'Light counter: 0' }).click(); await page.getByLabel('Lab sample').selectOption('second'); await page.getByRole('button', { name: 'Change sample' }).click();
  await expect(page.getByText('URL consumer two: second')).toBeVisible(); await expect(draft).toHaveValue('Local draft'); expect(await draft.evaluate(node => node === window.labDraft)).toBe(true); expect(new URL(page.url()).searchParams.get('campaign')).toBe('retained');
  await page.goBack(); await expect(page.getByText('URL consumer one: first')).toBeVisible(); await expect(page.getByRole('button', { name: 'Light counter: 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Load failing module' }).click(); await expect(page.getByRole('status').filter({ hasText: /Optional experiment/ })).toContainText('failed: deliberate');
  await page.getByRole('button', { name: 'Light counter: 1' }).click(); await page.getByRole('button', { name: 'Load slow shadow preview' }).click(); await expect(page.getByRole('button', { name: 'Light counter: 2' })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Shadow count: 0' })).toBeVisible(); await page.getByRole('button', { name: 'Shadow count: 0' }).click(); await expect(page.getByRole('button', { name: 'Shadow count: 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Activate mapped Web Awesome' }).click(); await expect(page.getByRole('switch', { name: 'Mapped lab switch' })).toBeVisible();
  await page.getByRole('button', { name: 'Activate vanilla preview' }).click(); await expect(page.getByRole('button', { name: 'Vanilla count: 0' })).toBeVisible();
  await page.locator('form').filter({ has: page.getByLabel('Echo message', { exact: true }) }).evaluate(form => form.setAttribute('novalidate','')); await page.getByLabel('Echo message', { exact: true }).fill('x'); await page.getByRole('button', { name: 'Validate echo', exact: true }).click(); await expect(page.locator('[data-error-for="message"]')).toContainText('three'); await expect(page.getByLabel('Echo message', { exact: true })).toHaveValue('x');
  expect(errors).toEqual([]);
});
