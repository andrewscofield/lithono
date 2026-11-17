import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    inventoryA?: Element;
  }
}

test('inventory keyed editors preserve draft/focus across independent adjustment and sorting; conflicts and ownership', async ({ page }) => {
  await page.goto('/register?next=/inventory');
  await page.getByLabel('Name', { exact: true }).fill('inventory-user'); await page.getByLabel('Email', { exact: true }).fill('inventory-user@example.test'); await page.getByLabel('Password', { exact: true }).fill('inventory-password-123'); await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('[defer-hydration]')).toHaveCount(0);
  const editors = page.locator('inventory-editor');
  const a = editors.first(); const b = editors.nth(1);
  await a.locator('summary').click(); await b.locator('summary').click();
  await a.getByLabel('Reason').fill('Keep local draft');
  await a.evaluate(node => { window.inventoryA = node; });
  await b.getByLabel('Reason').fill('Receive stock'); await b.getByLabel('Stock', { exact: true }).fill('30');
  await b.getByRole('button', { name: 'Save LAB-002' }).click();
  await expect(b).toContainText('Server stock 30');
  await expect(a.getByLabel('Reason')).toHaveValue('Keep local draft');
  expect(await a.evaluate(node => node === window.inventoryA)).toBe(true);
  // A concurrent edit uses the same authenticated API but the editor retains its old version.
  const input = await a.locator('form').evaluate(form => Object.fromEntries(new FormData(form as HTMLFormElement)));
  const action = await a.locator('form').getAttribute('action');
  const response = await page.request.post(action!, { form: { ...input, reason: 'Other tab', stock: '9' }, headers: { Origin: 'http://127.0.0.1:4197', Accept: 'application/json' } }); expect(response.status()).toBe(200);
  await a.getByRole('button', { name: 'Save LAB-001' }).click();
  await expect(a.locator('[data-form-error]')).toContainText('Conflict');
  await expect(a.getByLabel('Reason')).toHaveValue('Keep local draft');
  await page.getByLabel('Search inventory').fill('kit 1'); await page.getByRole('button', { name: 'Filter inventory' }).click();
  await expect(page.getByRole('status').filter({ hasText: /items · Page/ })).toContainText('4 items');
  await page.getByLabel('Sort inventory').selectOption('stock'); await page.getByRole('button', { name: 'Filter inventory' }).click();
  const retained = page.locator('inventory-editor').filter({ hasText: 'Edit LAB-001' });
  await expect(retained.getByLabel('Reason')).toHaveValue('Keep local draft');
  expect(await retained.evaluate(node => node === window.inventoryA)).toBe(true);
  await retained.getByRole('button', { name: 'Reload current values' }).click(); await expect(retained.getByLabel('Stock', { exact: true })).toHaveValue('9');
});
test('inventory adopts a pre-enhancement draft, supports repeated saves and keeps typing during a pending save', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/register?next=/inventory');
  await page.getByLabel('Name', { exact: true }).fill('inventory-repeat');
  await page.getByLabel('Email', { exact: true }).fill('inventory-repeat@example.test');
  await page.getByLabel('Password', { exact: true }).fill('inventory-password-123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/inventory');
  await expect(page.locator('inventory-editor').first()).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*', async route => {
    if (/@lithono\/bootstrap|framework\/client\/bootstrap\.(?:ts|js)|virtual:lithono-bootstrap|\/assets\/[^/?]*bootstrap[^/?]*\.js/.test(route.request().url())) await gate;
    await route.continue();
  });
  await page.goto('/inventory', { waitUntil: 'commit' });
  const editor = page.locator('inventory-editor').first();
  await editor.locator('summary').click();
  await editor.getByLabel('Stock', { exact: true }).fill('7');
  await editor.getByLabel('Reason').fill('Before enhancement');
  expect(await page.evaluate(() => !!customElements.get('inventory-editor'))).toBe(false);
  release();
  await expect(page.locator('[defer-hydration]')).toHaveCount(0);
  await editor.evaluate(async node => {
    await customElements.whenDefined('inventory-editor');
    await (node as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
  });
  await expect(editor.getByLabel('Stock', { exact: true })).toHaveValue('7');
  await expect(editor.getByLabel('Reason')).toHaveValue('Before enhancement');
  await editor.getByRole('button', { name: 'Save LAB-001' }).click();
  await expect(editor.locator('[name=version]')).toHaveValue('2');
  await expect(editor.getByLabel('Reason')).toHaveValue('');

  let releaseSave!: () => void;
  let fetched!: () => void;
  const serverSaved = new Promise<void>(resolve => { fetched = resolve; });
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route('**/*_action=adjust*', async route => {
    const response = await route.fetch();
    fetched(); await saveGate;
    await route.fulfill({ response });
  });
  await editor.getByLabel('Stock', { exact: true }).fill('8');
  await editor.getByLabel('Reason').fill('Second adjustment');
  await editor.getByRole('button', { name: 'Save LAB-001' }).click();
  await serverSaved;
  await editor.getByLabel('Stock', { exact: true }).fill('9');
  await editor.getByLabel('Reason').fill('Typing during save');
  releaseSave();
  await expect(editor.locator('[name=version]')).toHaveValue('3');
  await expect(editor.getByLabel('Stock', { exact: true })).toHaveValue('9');
  await expect(editor.getByLabel('Reason')).toHaveValue('Typing during save');
  await editor.getByRole('button', { name: 'Save LAB-001' }).click();
  await expect(editor.locator('[name=version]')).toHaveValue('4');
  await expect(editor).toContainText('Server stock 9');
  await expect(editor.getByLabel('Reason')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('inventory native versioned edits and audit without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  await page.goto('/register?next=/inventory'); await page.getByLabel('Name', { exact: true }).fill('inventory-native'); await page.getByLabel('Email', { exact: true }).fill('inventory-native@example.test'); await page.getByLabel('Password', { exact: true }).fill('inventory-password-123'); await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.locator('inventory-editor').first().locator('summary').click(); await page.getByRole('link', { name: 'Native edit and audit' }).first().click();
  await page.getByLabel('Stock', { exact: true }).fill('15'); await page.getByLabel('Reason').fill('Native receipt'); await page.getByRole('button', { name: 'Save adjustment' }).click(); await expect(page.getByText('15 · Native receipt')).toHaveCount(0); await expect(page.getByText('13 · Native receipt')).toBeVisible(); await page.reload(); await expect(page.getByText(/Current stock 15/)).toBeVisible(); await context.close();
});
