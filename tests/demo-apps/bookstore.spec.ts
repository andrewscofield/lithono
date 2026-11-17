import { test, expect } from '@playwright/test';

for (const javascript of [true, false]) {
  test(`bookstore creates, receives and publishes a product (${javascript ? 'enhanced' : 'native'})`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: javascript });
    const page = await context.newPage();
    const email = `books-${javascript ? 'enhanced' : 'native'}@example.test`;
    await page.goto('/register?next=/bookstore/admin');
    await page.getByLabel('Name', { exact: true }).fill('Bookstore staff');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('bookstore-password-123');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page).toHaveURL(/\/bookstore\/admin$/);
    const shop = await page.getByRole('link', { name: 'View your public shop' }).getAttribute('href');
    const create = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create draft book' }) });
    await create.getByLabel('Title', { exact: true }).fill('The Connected Bookshop');
    await create.getByLabel('Author', { exact: true }).fill('A. Reader');
    await create.getByLabel('SKU', { exact: true }).fill('CONNECTED-1');
    await create.getByLabel('URL slug', { exact: true }).fill('connected-bookshop');
    await create.getByLabel('Description', { exact: true }).fill('A useful fictional book about connected shops.');
    await create.getByRole('button', { name: 'Create draft book' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Connected Bookshop');
    expect((await page.request.get(`${shop}/connected-bookshop`)).status()).toBe(404);
    const save = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save product', exact: true }) });
    // A stock refresh must not erase an unrelated unfinished catalog edit.
    await save.getByLabel('Description', { exact: true }).fill('An unfinished description for staff.');
    const receive = page.locator('form').filter({ has: page.getByRole('button', { name: 'Receive stock', exact: true }) });
    const original = await receive.evaluate(form => Object.fromEntries(new FormData(form as HTMLFormElement)));
    const action = await receive.getAttribute('action');
    await receive.getByLabel('Copies received').fill('5');
    await receive.getByLabel('Delivery reference').fill('DELIVERY-ONE');
    await receive.getByRole('button', { name: 'Receive stock', exact: true }).click();
    await expect(page.getByText('5 copies on hand', { exact: true })).toBeVisible();
    await expect(page.getByText('+5 copies', { exact: true })).toBeVisible();
    if (javascript) await expect(save.getByLabel('Description', { exact: true })).toHaveValue('An unfinished description for staff.');
    const replay = await page.request.post(action!, { form: { ...original, quantity: '5', reference: 'DELIVERY-ONE' }, headers: { Origin: 'http://127.0.0.1:4197', Accept: 'application/json' } });
    expect(replay.status()).toBe(200);
    const stale = await page.request.post(action!, { form: { ...original, token: crypto.randomUUID(), quantity: '2', reference: 'STALE' }, headers: { Origin: 'http://127.0.0.1:4197', Accept: 'application/json' } });
    expect(stale.status()).toBe(409);
    await expect(receive.getByLabel('Delivery reference')).toHaveValue('');
    await receive.getByLabel('Copies received').fill('2');
    await receive.getByLabel('Delivery reference').fill('DELIVERY-TWO');
    await receive.getByRole('button', { name: 'Receive stock', exact: true }).click();
    await expect(page.getByText('7 copies on hand', { exact: true })).toBeVisible();
    await expect(page.getByText('+2 copies', { exact: true })).toBeVisible();
    await save.getByLabel('Storefront visibility').selectOption('published');
    await save.getByRole('button', { name: 'Save product', exact: true }).click();
    if (javascript) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: testInfo.outputPath('bookstore-backoffice.png'), fullPage: true });
    }
    await page.getByRole('link', { name: 'View product in your shop' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Connected Bookshop');
    await expect(page.getByText('7 copies in stock', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (javascript) await page.screenshot({ path: testInfo.outputPath('bookstore-shop-mobile.png'), fullPage: true });
    const publicURL = page.url();
    const anonymous = await browser.newContext();
    expect((await anonymous.request.get(publicURL)).status()).toBe(200);
    await anonymous.close();
    await context.close();
  });
}
