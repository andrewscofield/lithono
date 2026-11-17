import { test, expect } from '@playwright/test';

test('directory native GET and detail sources work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/components');
  await expect(page.locator('.card-list > li')).toHaveCount(13);
  await page.getByLabel('Search', { exact: true }).fill('counter');
  await page.getByLabel('Category').selectOption('Interaction');
  await page.getByLabel('Rendering').selectOption('shadow');
  await page.getByLabel('SSR evidence').selectOption('unknown');
  await page.getByRole('button', { name: 'Filter examples' }).click();
  await expect(page.locator('.card-list > li')).toHaveCount(1);
  await expect(page.getByLabel('Rendering')).toHaveValue('shadow');
  await page.reload();
  await page.getByRole('link', { name: 'Shadow counter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Install and import' })).toBeVisible();
  await expect(page.getByText('Unknown for this fixture:', { exact: false })).toBeVisible();
  await page.locator('summary').filter({ hasText: /^previews\/shadow\.ts$/ }).click();
  await expect(page.locator('details code')).toContainText('extends LitElement');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/components?ssr=verified');
  await expect(page.locator('.card-list > li')).toHaveCount(1);
  await page.getByRole('link', { name: 'Static banner', exact: true }).click();
  await expect(page.getByLabel('Static example')).toContainText('Static fragment:');
  await expect(page.getByRole('button', { name: 'Activate preview' })).toHaveCount(0);
  expect((await page.request.get('/components/not-curated')).status()).toBe(404);
  await context.close();
});

test('listing and inactive details avoid all preview libraries and property map SDK', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/components');
  await expect(page.getByRole('heading', { name: 'Component directory' })).toBeVisible();
  await page.goto('/components/wa-button?activation=manual');
  await expect(page.getByRole('button', { name: 'Activate preview' })).toBeVisible();
  expect(requests.filter(url => /webawesome|maplibre|[/-]previews[/-]|directory-counter[.-]/i.test(url))).toEqual([]);
  expect(await page.evaluate(() => ['wa-button', 'wa-switch', 'directory-counter', 'directory-shadow', 'directory-vanilla'].some(tag => customElements.get(tag)))).toBe(false);
  await page.getByRole('button', { name: 'Activate preview' }).click();
  await expect(page.locator('preview-host [role="status"]')).toContainText('Preview ready.');
  await page.locator('wa-button').click();
  await expect(page.locator('wa-button')).toHaveText('Web Awesome clicks: 1');
  expect(requests.some(url => /maplibre|previews[/-](shadow|vanilla|native)/.test(url))).toBe(false);
});

test('ordinary vanilla, Lit shadow and compiled light trio remain interactive on repeated visits', async ({ page }) => {
  for (const [slug, label] of [['vanilla-counter', 'Vanilla'], ['shadow-counter', 'Shadow'], ['light-counter', 'Light'], ['vanilla-counter', 'Vanilla']]) {
    await page.goto(`/components/${slug}`);
    const button = page.getByRole('button', { name: `${label} count: 0` });
    await button.click();
    await page.getByRole('button', { name: `${label} count: 1` }).click();
    await expect(page.getByRole('button', { name: `${label} count: 2` })).toBeVisible();
    expect(await page.locator('[data-preview]').evaluate(host => host.childElementCount)).toBe(1);
  }
});

test('every remaining fixture has its advertised platform behavior', async ({ page }) => {
  const activate = async (slug: string) => {
    await page.goto(`/components/${slug}`);
    await expect(page.locator('preview-host [role="status"]')).toContainText('Preview ready.');
  };
  await activate('wa-switch');
  await page.locator('wa-switch').click();
  await expect.poll(() => page.locator('wa-switch').evaluate(el => (el as HTMLElement & { checked: boolean }).checked)).toBe(true);
  await activate('native-details');
  await page.locator('[data-preview] summary').click();
  await expect(page.locator('[data-preview]')).toContainText('Native disclosure content.');
  await activate('native-progress');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '60');
  await activate('native-meter');
  await expect(page.locator('meter')).toHaveAttribute('value', '35');
  await activate('native-dialog');
  await page.getByRole('button', { name: 'Open dialog' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await activate('native-output');
  await page.getByRole('slider').fill('7');
  await expect(page.locator('[data-preview] output')).toHaveText('7');
  await activate('native-validation');
  await page.getByRole('button', { name: 'Check validity' }).click();
  await expect(page.locator('[data-preview] input:invalid')).toHaveCount(1);
  await page.getByLabel('Required name').fill('Ada');
  await page.getByRole('button', { name: 'Check validity' }).click();
  await expect(page.locator('[data-preview] output')).toHaveText('Valid name');
  await activate('native-form');
  await page.getByRole('button', { name: 'Search examples' }).click();
  await expect(page).toHaveURL(/\/components\?q=counter$/);
  await expect(page.locator('.card-list > li')).toHaveCount(3);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Native GET search', exact: true })).toBeVisible();
});

test('a failed import is contained and directory navigation still works', async ({ page }) => {
  await page.route(/\/previews\/shadow\.ts/, route => route.abort());
  // Production chunks have hashed names; intercept the named selected chunk too.
  await page.route(/\/assets\/(?:src-previews-)?shadow-[^/]+\.js/, route => route.abort());
  await page.goto('/components/shadow-counter');
  await expect(page.getByText('Preview failed to load.', { exact: false })).toBeVisible();
  await page.locator('preview-host').evaluate(host => {
    const sibling = host.cloneNode(true) as HTMLElement;
    sibling.dataset.example = 'vanilla-counter';
    sibling.id = 'independent-preview';
    host.after(sibling);
  });
  await page.locator('#independent-preview').getByRole('button', { name: 'Vanilla count: 0' }).click();
  await expect(page.locator('#independent-preview')).toContainText('Vanilla count: 1');
  await expect(page.locator('preview-host').first().locator('[role="status"]')).toContainText('Preview failed');
  await page.getByRole('link', { name: '← Component directory', exact: true }).click();
  await page.getByRole('link', { name: 'Vanilla counter', exact: true }).click();
  await page.getByRole('button', { name: 'Vanilla count: 0' }).click();
  await expect(page.getByRole('button', { name: 'Vanilla count: 1' })).toBeVisible();
});

test('disconnect during a selected import cancels mounting and reconnect can activate again', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/(?:\/previews\/vanilla\.ts|\/assets\/src-previews-vanilla-[^/]+\.js)/, async route => {
    await gate;
    await route.continue();
  });
  await page.goto('/components/vanilla-counter?activation=manual');
  const requested = page.waitForRequest(/(?:\/previews\/vanilla\.ts|\/assets\/src-previews-vanilla-[^/]+\.js)/);
  await page.getByRole('button', { name: 'Activate preview' }).click();
  await requested;
  await page.locator('preview-host').evaluate(host => {
    (window as Window & { detachedPreview?: Element }).detachedPreview = host;
    host.remove();
  });
  release();
  await page.waitForFunction(() => customElements.get('directory-vanilla'));
  expect(await page.evaluate(() => (window as Window & { detachedPreview?: Element }).detachedPreview!.querySelector('[data-preview]')!.childElementCount)).toBe(0);
  await page.locator('[aria-label="Working preview"]').evaluate(region => {
    region.append((window as Window & { detachedPreview?: Element }).detachedPreview!);
  });
  await page.getByRole('button', { name: 'Activate preview' }).click();
  await page.getByRole('button', { name: 'Vanilla count: 0' }).click();
  await expect(page.getByRole('button', { name: 'Vanilla count: 1' })).toBeVisible();
});
