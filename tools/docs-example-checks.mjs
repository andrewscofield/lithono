import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

async function ready(page) {
  await page.waitForFunction(() => {
    const source = document.getElementById('__LITHONO_DATA__')?.textContent;
    if (!source) return false;
    const data = JSON.parse(source);
    return !data.hydrate || Boolean(customElements.get(data.pageTag));
  });
}

async function register(page, origin, name, email) {
  await page.goto(`${origin}/register`);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('chapter-house-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/admin`);
}

async function values(form) { return form.evaluate(form => Object.fromEntries(new FormData(form))); }

export async function verifySimple(checkpoint, origin, browser) {
  const html = await (await fetch(origin)).text();
  assert.match(html, checkpoint === '01-catalog' ? /Field Notes/ : /Preview a delivery/);
  if (checkpoint === '01-catalog') { assert.match(html, /\$18\.00/); assert.match(html, /\$24\.50/); }
  else {
    const invalid = await fetch(`${origin}/?_action=preview`, { method: 'POST', redirect: 'manual',
      headers: { Origin: origin, Accept: 'text/html' }, body: new URLSearchParams({ quantity: '-2' }) });
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /value="-2"/);
  }
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled });
    try {
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      if (checkpoint === '01-catalog') await expect(page.getByRole('heading', { name: 'Field Notes', exact: true })).toBeVisible();
      else {
        if (javaScriptEnabled) await ready(page);
        await page.getByLabel('Copies received').fill('5');
        await page.getByRole('button', { name: 'Preview delivery', exact: true }).click();
        await expect(page).toHaveURL(`${origin}/?quantity=5`);
        await expect(page.getByRole('status').filter({ hasText: 'Preview: 5 copies. No stock changed.' })).toBeVisible();
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
}

export async function verifyBookstore(checkpoint, origin, browser) {
  const stages = ['bookstore-catalog', 'bookstore-account', 'bookstore-editing', 'bookstore-receiving', 'bookstore-publishing'];
  const stage = stages.indexOf(checkpoint);
  const html = await (await fetch(origin)).text();
  assert.match(html, /Field Notes/); assert.match(html, /\$18\.00/); assert.doesNotMatch(html, /Night Trains/);
  let publishedPath;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled });
    try {
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      if (stage === 0) {
        await page.goto(origin); await page.reload();
        await expect(page.getByText('$18.00 · 6 copies on hand', { exact: true })).toBeVisible();
        continue;
      }
      const anonymous = await page.request.get(`${origin}/admin`, { maxRedirects: 0 });
      assert.equal(anonymous.status(), 303);
      assert.match(anonymous.headers().location, /^\/login\?next=/);
      await register(page, origin, 'Bookshop reader', `${checkpoint}-${javaScriptEnabled}@example.test`);
      await expect(page.getByText(/Welcome, Bookshop reader/)).toBeVisible();
      if (stage >= 2) {
        await page.getByLabel('Title', { exact: true }).fill('The Connected Bookshop');
        await page.getByLabel('Author', { exact: true }).fill('A. Reader');
        await page.getByLabel('SKU', { exact: true }).fill('CONNECT-1');
        await page.getByLabel('URL slug', { exact: true }).fill('connected-bookshop');
        await page.getByLabel('Description', { exact: true }).fill('A fictional book about connected shops.');
        await page.getByLabel('Price in USD cents', { exact: true }).fill('2399');
        await page.getByRole('button', { name: 'Create draft book', exact: true }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Connected Bookshop');
        const editURL = page.url();
        const save = page.locator('main form');
        const original = await values(save);
        const endpoint = `${editURL}?_action=save`;
        await page.getByLabel('Description', { exact: true }).fill('An updated description that survives a reload.');
        await page.getByRole('button', { name: stage === 4 ? 'Save product' : 'Save draft', exact: true }).click();
        await expect(page.getByText(/Version 2/)).toBeVisible();
        const stale = await page.request.post(endpoint, { form: original, headers: { Origin: origin, Accept: 'application/json' } });
        assert.equal(stale.status(), 409);
        const other = await browser.newContext();
        try {
          const second = await other.newPage();
          await register(second, origin, 'Another owner', `other-${checkpoint}-${javaScriptEnabled}@example.test`);
          assert.equal((await second.request.get(editURL)).status(), 404);
          assert.equal((await second.request.post(endpoint, { form: { ...original, version: '2' }, headers: { Origin: origin, Accept: 'application/json' } })).status(), 409);
        } finally { await other.close(); }
        const unauthenticated = await browser.newContext();
        try {
          assert.equal((await unauthenticated.request.post(endpoint, { form: original, headers: { Origin: origin, Accept: 'application/json' } })).status(), 401);
        } finally { await unauthenticated.close(); }
        if (stage >= 3) {
          await page.getByRole('link', { name: 'Receive a delivery', exact: true }).click();
          await expect(page.getByRole('heading', { level: 1 })).toHaveText('Receive The Connected Bookshop');
          if (javaScriptEnabled) await ready(page);
          const receive = page.locator('main form');
          const initial = await values(receive);
          const receiveURL = `${page.url()}?_action=receive`;
          await page.getByLabel('Copies received').fill('5');
          await page.getByLabel('Delivery reference').fill('DELIVERY-ONE');
          await page.getByRole('button', { name: 'Receive stock', exact: true }).click();
          await expect(page.getByText('5 copies on hand', { exact: true })).toBeVisible();
          const payload = { ...initial, quantity: '5', reference: 'DELIVERY-ONE' };
          assert.equal((await page.request.post(receiveURL, { form: payload, headers: { Origin: origin, Accept: 'application/json' } })).status(), 200);
          assert.equal((await page.request.post(receiveURL, { form: { ...payload, quantity: '7' }, headers: { Origin: origin, Accept: 'application/json' } })).status(), 409);
          assert.equal((await page.request.post(receiveURL, { form: { ...payload, token: crypto.randomUUID() }, headers: { Origin: origin, Accept: 'application/json' } })).status(), 409);
          await page.getByLabel('Copies received').fill('2');
          await page.getByLabel('Delivery reference').fill('DELIVERY-TWO');
          await page.getByRole('button', { name: 'Receive stock', exact: true }).click();
          await expect(page.getByText('7 copies on hand', { exact: true })).toBeVisible();
          await page.reload();
          await expect(page.getByText('+5 copies · DELIVERY-ONE', { exact: true })).toBeVisible();
          await expect(page.getByText('+2 copies · DELIVERY-TWO', { exact: true })).toBeVisible();
          await page.getByRole('link', { name: 'Edit book', exact: true }).click();
        }
        if (stage === 4) {
          publishedPath = await page.getByRole('link', { name: 'View public book', exact: true }).getAttribute('href');
          assert.equal((await page.request.get(`${origin}${publishedPath}`)).status(), 404);
          await page.getByLabel('Storefront visibility').selectOption('published');
          await page.getByRole('button', { name: 'Save product', exact: true }).click();
          await expect(page.getByText(/Version 5/)).toBeVisible();
          await page.getByRole('link', { name: 'View public book', exact: true }).click();
          await expect(page.getByText('$23.99', { exact: true })).toBeVisible();
          await expect(page.getByText('7 copies in stock', { exact: true })).toBeVisible();
          await page.goto(editURL);
          await page.getByLabel('Storefront visibility').selectOption('draft');
          await page.getByRole('button', { name: 'Save product', exact: true }).click();
          await expect(page.getByText(/Version 6/)).toBeVisible();
          assert.equal((await page.request.get(`${origin}${publishedPath}`)).status(), 404);
          await page.getByLabel('Storefront visibility').selectOption('published');
          await page.getByRole('button', { name: 'Save product', exact: true }).click();
          await expect(page.getByText(/Version 7/)).toBeVisible();
        }
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL(`${origin}/`);
      await page.goto(`${origin}/admin`); await expect(page).toHaveURL(/\/login\?next=/);
      await page.getByLabel('Email', { exact: true }).fill(`${checkpoint}-${javaScriptEnabled}@example.test`);
      await page.getByLabel('Password', { exact: true }).fill('chapter-house-password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(`${origin}/admin`);
      assert.deepEqual(errors, [], checkpoint);
    } finally { await context.close(); }
  }
  return publishedPath;
}

export async function verifyAPI(origin, browser) {
  const native = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await native.newPage(); await page.goto(origin);
    await expect(page.getByText('Book cover fallback', { exact: true })).toBeVisible();
    await expect(page.getByText('Published book fallback', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Commit through a native form', exact: true }).click();
    await expect(page.locator('[data-count]')).toHaveText('Snapshot count: 1');
  } finally { await native.close(); }
  const context = await browser.newContext();
  try {
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin); await ready(page);
    await expect(page.locator('[data-context]')).toHaveText('Context count: 1');
    await expect(page.locator('[data-session]')).toHaveText('Public session: Guest');
    await expect(page.locator('[data-decorated-session]')).toHaveText('Decorated session: Guest');
    await page.locator('input[name="mode"]').evaluate(input => { input.value = 'invalid'; });
    await page.getByRole('button', { name: 'Commit through a native form', exact: true }).click();
    await expect(page.locator('[data-form-event]')).toContainText('Invalid option');
    await expect(page.locator('main form')).toHaveAttribute('data-state', 'error');
    await page.locator('input[name="mode"]').evaluate(input => { input.value = 'ok'; });
    await page.getByRole('button', { name: 'Commit through a native form', exact: true }).click();
    await expect(page.locator('[data-context]')).toHaveText('Context count: 2');
    await expect(page.locator('[data-form-event]')).toHaveText('Form action: commit');
    await page.getByRole('button', { name: 'Commit with failed refresh', exact: true }).click();
    await expect(page.locator('[data-refresh-error]')).toContainText('Write succeeded');
    await expect(page.locator('[data-count]')).toHaveText('Snapshot count: 2');
    await page.getByRole('button', { name: 'Refresh view', exact: true }).click();
    await expect(page.locator('[data-context]')).toHaveText('Context count: 3');
    await page.getByRole('button', { name: 'Next query page', exact: true }).click();
    await expect(page.locator('[data-query]')).toHaveText('Query page: 2');
    await page.goBack(); await expect(page.locator('[data-query]')).toHaveText('Query page: 1');
    await page.getByRole('button', { name: 'Try unavailable page', exact: true }).click();
    await expect(page.locator('[data-navigation-error]')).toContainText('existing view remains');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Executable lifecycle examples');
    await page.evaluate(() => {
      const panel = document.querySelector('lifecycle-panel');
      const owner = panel.closest('[data-lithono-page]'); const parent = panel.parentElement;
      const before = panel.message; panel.remove();
      owner.dispatchEvent(new CustomEvent('lithono:success', { detail: { action: 'detached' } }));
      if (panel.message !== before) throw new Error('Disconnected host retained its event listener');
      parent.append(panel);
    });
    await page.getByRole('button', { name: 'Next query page', exact: true }).click();
    await expect(page.locator('[data-query]')).toHaveText('Query page: 2');
    await expect(page.locator('motion-sample')).toHaveAttribute('data-motion-state', 'played');
    assert.equal(await page.locator('motion-sample').evaluate(node => { node.remove(); return node.getAttribute('data-motion-state'); }), 'released');
    await register(page, origin, 'Lifecycle reader', 'lifecycle-reader@example.test');
    await page.goto(origin);
    await expect(page.locator('[data-session]')).toHaveText('Public session: Lifecycle reader');
    await expect(page.locator('[data-decorated-session]')).toHaveText('Decorated session: Lifecycle reader');
    await page.getByRole('link', { name: 'Another page', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Another page');
    await page.goBack(); await expect(page.locator('[data-context]')).toHaveText('Context count: 3');
    await page.getByRole('link', { name: 'Inspect catalog route params', exact: true }).click();
    await expect(page.locator('[data-param]')).toHaveText('Route parameter id: catalog');
    await page.goBack(); await expect(page.locator('[data-param]')).toHaveText('Route parameter id: (root)');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await reduced.newPage(); await page.goto(origin);
    await expect(page.locator('motion-sample')).toHaveAttribute('data-motion-state', 'reduced');
    await expect(page.locator('lithono-animate')).not.toHaveAttribute('data-animate-pending', '');
    assert.equal(await page.getByText('Published book fallback', { exact: true }).evaluate(node => getComputedStyle(node).opacity), '1');
  } finally { await reduced.close(); }
}
