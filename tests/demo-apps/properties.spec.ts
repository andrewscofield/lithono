import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.locator('[defer-hydration]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search properties' })).toBeVisible();
}

test('property native GET search, sorting, pagination and unrelated query keys work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4197/listings?tag=keep&tag=also&page=3');
  await page.getByLabel('Location or address').fill('Bend');
  await page.getByRole('button', { name: 'Search properties' }).click();
  await expect(page.getByRole('status').filter({ hasText: /properties · Page/ })).toHaveText('5 properties · Page 1 of 1');
  expect(new URL(page.url()).searchParams.getAll('tag')).toEqual(['keep', 'also']);
  await page.getByLabel('Location or address').fill('');
  await page.getByLabel('Sort properties').selectOption('price-asc');
  await page.getByRole('button', { name: 'Search properties' }).click();
  await page.getByRole('link', { name: 'Next page' }).click();
  await expect(page.getByRole('status').filter({ hasText: /properties · Page/ })).toHaveText('28 properties · Page 2 of 5');
  await page.reload();
  await expect(page.getByLabel('Sort properties')).toHaveValue('price-asc');
  await context.close();
});

test('enhanced property browsing does not download server schema validation libraries', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/listings');
  await page.waitForFunction(() => !!customElements.get('property-filters'));
  await expect(page.locator('[defer-hydration]')).toHaveCount(0);
  expect(requests.filter(url => /zod(?:[./_@-]|$)/i.test(url))).toEqual([]);
});

test('property URL owner handles rapid filters, history, key reset and list visits fetch no MapLibre SDK', async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/listings?page=3&campaign=preserved');
  await ready(page);
  const owner = page.locator('property-filters');
  await owner.evaluate(node => node.setAttribute('data-original', 'yes'));
  await page.getByLabel('Location or address').fill('Bend');
  await page.getByRole('button', { name: 'Search properties' }).click();
  await expect(page).not.toHaveURL(/page=3/);
  await expect(page.getByRole('status').filter({ hasText: /properties · Page/ })).toHaveText('5 properties · Page 1 of 1');
  await expect(owner).toHaveAttribute('data-original', 'yes');
  expect(new URL(page.url()).searchParams.get('campaign')).toBe('preserved');
  let releaseOld!: () => void;
  let oldStarted!: () => void;
  const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
  const oldRequest = new Promise<void>(resolve => { oldStarted = resolve; });
  await page.route('**/listings?**', async route => {
    if (new URL(route.request().url()).searchParams.get('q') !== 'Portland' || route.request().headers()['x-lithono-revalidate'] !== '1') return route.continue();
    const response = await route.fetch();
    oldStarted();
    await oldGate;
    await route.fulfill({ response }).catch(() => {}); // The superseding query aborts this request.
  });
  await page.getByLabel('Location or address').fill('Portland');
  await page.getByRole('button', { name: 'Search properties' }).click();
  await oldRequest;
  await page.getByLabel('Location or address').fill('Astoria');
  await page.getByRole('button', { name: 'Search properties' }).click();
  await expect(page).toHaveURL(/q=Astoria/);
  await expect(page.locator('.card-list')).toContainText('Astoria');
  releaseOld();
  await page.unroute('**/listings?**');
  await expect(page.locator('.card-list')).not.toContainText('Portland');
  await page.goBack();
  await expect(page.getByLabel('Location or address')).toHaveValue('Portland');
  await page.goForward();
  await expect(page.getByLabel('Location or address')).toHaveValue('Astoria');
  await page.reload();
  await ready(page);
  expect(requests.filter(url => /maplibre-gl[./_-]/i.test(url))).toEqual([]);
  let releaseDisconnected!: () => void;
  let disconnectedStarted!: () => void;
  let held = false;
  const disconnectedGate = new Promise<void>(resolve => { releaseDisconnected = resolve; });
  const disconnectedRequest = new Promise<void>(resolve => { disconnectedStarted = resolve; });
  await page.route('**/listings?**', async route => {
    if (held || new URL(route.request().url()).searchParams.get('q') !== 'Eugene') return route.continue();
    held = true;
    const response = await route.fetch();
    disconnectedStarted();
    await disconnectedGate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByLabel('Location or address').fill('Eugene');
  await page.getByRole('button', { name: 'Search properties' }).click();
  await disconnectedRequest;
  await owner.evaluate(node => {
    const parent = node.parentNode!;
    const next = node.nextSibling;
    node.remove();
    parent.insertBefore(node, next);
  });
  await expect(page.locator('.card-list')).toContainText('Eugene');
  releaseDisconnected();
  await page.unroute('**/listings?**');
  await page.getByLabel('Location or address').fill('');
  await page.getByLabel('Property type').selectOption('land');
  await page.getByLabel('Property status').selectOption('sold');
  await page.getByRole('button', { name: 'Search properties' }).click();
  await expect(page.getByRole('status').filter({ hasText: /properties · Page/ })).toHaveText('2 properties · Page 1 of 1');
  await expect(page.locator('.card-list')).not.toContainText('House');
  await page.goBack();
  await expect(page.getByLabel('Property type')).toHaveValue('all');
  await expect(page.getByLabel('Property status')).toHaveValue('all');
  expect(errors).toEqual([]);
});

test('actual MapLibre is deferred, uses deterministic local style and keeps its instance across result refreshes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let styleRequests = 0;
  await page.route('**/test-property-style.json', async route => {
    styleRequests++;
    await route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dbece5' } }] } });
  });
  await page.goto('/listings');
  await ready(page);
  expect(styleRequests).toBe(0);
  let loaderRequests = 0;
  page.on('request', request => { if (request.headers()['x-lithono-revalidate'] === '1') loaderRequests++; });
  await page.getByRole('link', { name: 'Map view', exact: true }).click();
  await expect(page.locator('property-map').getByRole('status')).toContainText('Map ready', { timeout: 30000 });
  expect(styleRequests).toBe(1);
  expect(loaderRequests).toBe(0);
  const canvas = page.locator('property-map canvas.maplibregl-canvas');
  await expect(canvas).toHaveCount(1);
  await canvas.evaluate(node => node.setAttribute('data-original', 'yes'));
  await page.getByLabel('Location or address').fill('Bend');
  await page.getByRole('button', { name: 'Search properties' }).click();
  await expect(page.locator('.card-list')).toContainText('Bend');
  await expect(canvas).toHaveAttribute('data-original', 'yes');
  await expect(page.locator('property-map a[aria-label]')).toHaveCount(5);
  expect(styleRequests).toBe(1);
  await page.getByRole('link', { name: 'List view', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Property map' })).toBeHidden();
  await page.goBack();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-original', 'yes');
  await page.locator('property-map').evaluate(node => {
    const parent = node.parentNode!;
    const next = node.nextSibling;
    node.remove();
    parent.insertBefore(node, next);
  });
  await expect(page.locator('property-map canvas.maplibregl-canvas')).toHaveCount(1);
  await expect(page.locator('property-map a[aria-label]')).toHaveCount(5);
  await expect(page.locator('property-map canvas')).not.toHaveAttribute('data-original', 'yes');
  await page.locator('property-map a[aria-label]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/listings\/explorer-/);
  expect(errors).toEqual([]);
});

test('inquiry validates, records durably, retries idempotently and reports failed email honestly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/register');
  await expect(page.locator('[defer-hydration]')).toHaveCount(0);
  await page.getByLabel('Name', { exact: true }).fill('Property visitor');
  await page.getByLabel('Email', { exact: true }).fill('property-visitor@example.test');
  await page.getByLabel('Password', { exact: true }).fill('property-visitor-password123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await page.goto('/listings/1');
  await expect(page.locator('[defer-hydration]')).toHaveCount(0);
  const form = page.locator('form[action*="_action=inquire"]');
  await form.evaluate(node => { (node as HTMLFormElement).noValidate = true; });
  await page.getByLabel('Your inquiry').fill('short');
  await page.getByRole('button', { name: 'Record inquiry' }).click();
  await expect(form.locator('[data-error-for="message"]')).toContainText('at least 10');
  await expect(page.getByLabel('Your inquiry')).toHaveValue('short');
  await page.getByLabel('Your inquiry').fill('Please arrange a viewing next week.');
  await page.getByRole('button', { name: 'Record inquiry' }).click();
  await expect(page).toHaveURL(/inquiry=/);
  const receiptUrl = page.url();
  await expect(page.getByRole('status')).toContainText('Email delivery failed');
  await page.getByRole('button', { name: 'Retry receipt email' }).click();
  await expect(page).toHaveURL(receiptUrl);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Inquiry recorded. Email delivery failed');
  expect(errors).toEqual([]);
});

test('active map style failure keeps an explicit list alternative', async ({ page }) => {
  await page.route('**/test-property-style.json', route => route.fulfill({ status: 503, body: 'Style unavailable' }));
  await page.goto('/listings?view=map&q=Salem');
  await ready(page);
  await expect(page.locator('property-map').getByRole('status')).toContainText('Map style or tiles could not load', { timeout: 30000 });
  await expect(page.locator('.card-list')).toContainText('Salem');
  await page.getByRole('link', { name: 'List view', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Property map' })).toBeHidden();
  await expect(page.locator('.card-list a').first()).toBeVisible();
});

test('native inquiry validates and preserves escaped textarea values without JS; receipt acceptance is scoped', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4197/register');
  await page.getByLabel('Name', { exact: true }).fill('Native property visitor');
  await page.getByLabel('Email', { exact: true }).fill('native-property@example.test');
  await page.getByLabel('Password', { exact: true }).fill('native-property-password123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.goto('http://127.0.0.1:4197/listings/1');
  // Submit through the real route with native form encoding to exercise server
  // validation even though the browser would reject this short value locally.
  const action = await page.locator('form[action*="_action=inquire"]').getAttribute('action');
  const key = await page.locator('input[name="submissionKey"]').inputValue();
  const response = await page.request.post(`http://127.0.0.1:4197${action}`, {
    form: { submissionKey: key, message: '</textarea><script>bad()</script>' + 'x'.repeat(2001) },
  });
  expect(response.status()).toBe(400);
  const invalidHtml = await response.text();
  expect(invalidHtml).toContain('&lt;/textarea&gt;');
  expect(invalidHtml).not.toContain('<script>bad()</script>');
  await page.getByLabel('Your inquiry').fill('Could I arrange a viewing on Friday?');
  await page.getByRole('button', { name: 'Record inquiry' }).click();
  await expect(page).toHaveURL(/inquiry=/);
  await expect(page.getByRole('status')).toContainText('Resend accepted your receipt email; inbox delivery is not confirmed');
  const receiptUrl = page.url();
  const duplicate = await page.request.post(`http://127.0.0.1:4197${action}`, {
    form: { submissionKey: key, message: 'Could I arrange a viewing on Friday?' },
  });
  expect(duplicate.url()).toBe(receiptUrl);
  await page.getByRole('button', { name: 'Retry receipt email' }).click();
  await expect(page).toHaveURL(receiptUrl);
  const other = await browser.newContext({ javaScriptEnabled: false });
  const publicPage = await other.newPage();
  await publicPage.goto(receiptUrl);
  await expect(publicPage.getByRole('button', { name: 'Retry receipt email' })).toHaveCount(0);
  await other.close();
  await context.close();
});
