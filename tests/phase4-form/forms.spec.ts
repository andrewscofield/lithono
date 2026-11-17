import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    success?: () => void;
  }
}

async function ready(page: Page) {
  await page.goto('/phase4');
  await page.waitForFunction(() => !!customElements.get('phase4-host'));
}
async function result(page: Page) {
  await expect(page.locator('#form')).toHaveAttribute('data-state', 'success');
  return JSON.parse(await page.locator('#result').textContent() ?? '{}');
}
async function action(page: Page, name: string) {
  await page.locator('#form').evaluate((form, name) => form.setAttribute('action', `/phase4?_action=${name}`), name);
}

test('successful controls, submitter, effective method/destination, encodings, repeated values and files', async ({ page }) => {
  await ready(page);
  await page.locator('[name=upload]').setInputFiles([
    { name: 'first.txt', mimeType: 'text/plain', buffer: Buffer.from('one') },
    { name: 'second.txt', mimeType: 'text/plain', buffer: Buffer.from('two') },
  ]);
  await page.locator('#form').evaluate((form) => form.setAttribute('target', '_blank'));
  await page.locator('#save').evaluate((button) => button.setAttribute('formtarget', '_self'));
  await page.locator('#save').click();
  let value = await result(page);
  expect(value.method).toBe('POST');
  expect(value.contentType).toContain('application/x-www-form-urlencoded');
  expect(value.url).toContain('destination=kept');
  expect(value.input).toMatchObject({ tag: ['one', 'two'], choice: ['A', 'B'], check: 'yes', custom: 'custom initial', external: 'outside', intent: 'save', upload: ['first.txt', 'second.txt'] });
  expect(value.input.excluded).toBeUndefined();
  await page.locator('#form').evaluate((form) => form.removeAttribute('target'));
  await page.locator('#multipart').click();
  value = await result(page);
  expect(value.contentType).toContain('multipart/form-data; boundary=');
  expect(value.input.upload).toEqual([{ name: 'first.txt', size: 3 }, { name: 'second.txt', size: 3 }]);
  await page.locator('#search').click();
  value = await result(page);
  expect(value.method).toBe('GET');
  expect(value.input).toMatchObject({ tag: ['one', 'two'], upload: ['first.txt', 'second.txt'] });
  expect(value.url).not.toContain('obsolete=');
  expect(value.contentType).toBeNull();
  await page.locator('#multipart').evaluate((button) => button.setAttribute('formenctype', 'text/plain'));
  await page.locator('#multipart').click();
  value = await result(page);
  expect(value.contentType).toBe('text/plain');
  expect(value.plainBody).toContain('tag=one\r\ntag=two\r\n');
  expect(value.plainBody).toContain('intent=upload\r\n');
});

test('application custom validity remains intact, disabled FACE is excluded, and reset-on-success is native', async ({ page }) => {
  await ready(page);
  await page.locator('[name=title]').evaluate((input: HTMLInputElement) => input.setCustomValidity('Application rule'));
  await page.locator('[name=title]').fill('edited');
  await page.locator('#save').click();
  await expect(page.locator('[data-error-for=title]')).toHaveText('Application rule');
  await page.locator('[name=title]').evaluate((input: HTMLInputElement) => input.setCustomValidity(''));
  await page.locator('phase4-control').evaluate((control: HTMLElement & { setValue(value: string): void }) => {
    control.setValue('');
    control.setAttribute('disabled', '');
  });
  await page.locator('#form').evaluate((form) => form.setAttribute('data-reset-on-success', ''));
  await page.locator('#save').click();
  await expect(page.locator('#result')).not.toBeEmpty();
  expect(JSON.parse(await page.locator('#result').textContent() ?? '{}').input.custom).toBeUndefined();
  await expect(page.locator('[name=title]')).toHaveValue('initial');
  await expect(page.locator('#form')).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('#disabled')).toBeDisabled();
});

test('native and ElementInternals validation, disabled controls and explicit opt-outs', async ({ page }) => {
  await ready(page);
  expect(await page.locator('#form').evaluate((form: HTMLFormElement) => form.noValidate)).toBe(false);
  let requests = 0;
  page.on('request', (request) => { if (request.url().includes('_action=')) requests++; });
  await page.locator('[name=title]').fill('');
  await page.locator('#save').click();
  expect(requests).toBe(0);
  await expect(page.locator('[name=title]')).toBeFocused();
  await expect(page.locator('[name=title]')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('[name=title]').fill('valid');
  await page.locator('phase4-control').evaluate((control: HTMLElement & { setValue(value: string): void }) => control.setValue(''));
  await page.locator('#save').click();
  expect(requests).toBe(0);
  await expect(page.locator('phase4-control')).toBeFocused();
  await page.locator('#skip').click();
  await result(page);
  expect(requests).toBe(1);
  await page.locator('#form').evaluate((form: HTMLFormElement) => { form.noValidate = true; });
  await page.locator('#save').click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator('#disabled')).toBeDisabled();
});

test('server errors associate hints, live status and focus; native reset preserves defaults and disabled states', async ({ page }) => {
  await ready(page);
  await action(page, 'issues');
  await page.locator('[name=title]').fill('draft');
  await page.locator('#save').click();
  await expect(page.locator('#form')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('[name=title]')).toBeFocused();
  const errorId = await page.locator('[data-error-for=title]').getAttribute('id');
  await expect(page.locator('[name=title]')).toHaveAttribute('aria-describedby', `hint ${errorId}`);
  await expect(page.locator('[data-form-error]')).toHaveAttribute('role', 'status');
  await expect(page.locator('[data-form-error]')).toHaveText('Rejected');
  await page.locator('#form').evaluate((form) => form.addEventListener('reset', (event) => event.preventDefault(), { once: true }));
  await page.locator('button[type=reset]').click();
  await expect(page.locator('[name=title]')).toHaveValue('draft');
  await expect(page.locator('[data-form-error]')).toHaveText('Rejected');
  await page.locator('button[type=reset]').click();
  await expect(page.locator('[name=title]')).toHaveValue('initial');
  await expect(page.locator('[name=title]')).toHaveAttribute('aria-describedby', 'hint');
  await expect(page.locator('[data-error-for=title]')).toBeHidden();
  await expect(page.locator('[data-form-error]')).toHaveText('');
  await expect(page.locator('#form')).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('#disabled')).toBeDisabled();
});

test('missing action and failed enhancement never succeed or retry; pending submits mutate once', async ({ page, request }) => {
  await ready(page);
  let successes = 0;
  await page.exposeFunction('success', () => successes++);
  await page.evaluate(() => document.querySelector('phase4-host')!.addEventListener('lithono:success', () => window.success?.()));
  const before = (await (await request.get('/phase4/count')).json()).mutations;
  for (const name of ['missing', 'toString', 'fail', 'malformed']) {
    await action(page, name);
    await page.locator('#save').click();
    await expect(page.locator('#form')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('[data-form-error]')).not.toBeEmpty();
  }
  expect(successes).toBe(0);
  expect((await (await request.get('/phase4/count')).json()).mutations - before).toBe(2);
  await action(page, 'save');
  let attempts = 0;
  await page.route('**/*_action=save', async (route) => { attempts++; await route.abort('failed'); });
  await page.locator('#save').click();
  await expect(page.locator('#form')).toHaveAttribute('data-state', 'error');
  expect(attempts).toBe(1);
  expect(successes).toBe(0);
  await page.unroute('**/*_action=save');
  await action(page, 'slow');
  await page.locator('#save').dblclick();
  await result(page);
  expect((await (await request.get('/phase4/count')).json()).mutations - before).toBe(3);
});

test('origin, path, formtarget and native marker pass through to navigation', async ({ page }) => {
  for (const mode of ['origin', 'path', 'target', 'native']) {
    await ready(page);
    await page.route('**/*_action=*', async (route) => {
      expect(route.request().isNavigationRequest()).toBe(true);
      await route.fulfill({ contentType: 'text/html', body: '<p>Native destination</p>' });
    });
    if (mode === 'target') {
      await page.evaluate(() => {
        document.body.insertAdjacentHTML('beforeend', '<iframe name="destination"></iframe>');
        document.querySelector('#save')!.setAttribute('formtarget', 'destination');
      });
    } else if (mode === 'native') await page.locator('#form').evaluate((form) => form.setAttribute('data-lithono-native', ''));
    else await page.locator('#save').evaluate((button, mode) => button.setAttribute('formaction', mode === 'origin'
      ? 'http://localhost:4184/phase4?_action=save' : '/elsewhere?_action=save'), mode);
    await page.locator('#save').click();
    if (mode === 'target') await expect(page.frameLocator('iframe').locator('p')).toHaveText('Native destination');
    else await expect(page.locator('p')).toHaveText('Native destination');
    await page.unroute('**/*_action=*');
  }
});

test('JavaScript-disabled native POST and GET preserve repeated controls and submitters', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const button of ['save', 'search', 'multipart']) {
    await page.goto('http://127.0.0.1:4184/phase4');
    await page.locator('[name=title]').fill('');
    await page.locator(`#${button}`).click();
    await expect(page).toHaveURL('http://127.0.0.1:4184/phase4');
    await expect(page.locator('[name=title]:invalid')).toBeVisible();
    await page.locator('[name=title]').fill('native valid');
    await page.locator('[name=upload]').setInputFiles({ name: 'native.txt', mimeType: 'text/plain', buffer: Buffer.from('native') });
    await page.locator(`#${button}`).click();
    const value = JSON.parse(await page.locator('body').innerText());
    expect(value.input.tag).toEqual(['one', 'two']);
    expect(value.input.intent).toBe(button === 'search' ? undefined : button === 'multipart' ? 'upload' : button);
    expect(value.method).toBe(button === 'search' ? 'GET' : 'POST');
  }
  await context.close();
});
