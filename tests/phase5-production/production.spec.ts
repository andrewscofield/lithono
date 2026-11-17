import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    interactionDurations: number[];
  }
}

test('copied static artifact uses built envelope/CSS and shared router without component hydration', async ({ page, request }) => {
  const scripts: string[] = [];
  page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  const response = await page.goto('/');
  const text = await response!.text();
  expect(text).toContain('built-envelope');
  expect(text).toContain('__LITHONO_DATA__');
  expect(text).not.toContain('modulepreload');
  expect(text).not.toContain('rel="stylesheet"');
  expect(text).not.toContain('@import');
  expect(text).not.toContain('/src/');
  await expect(page.locator('h1')).toHaveCSS('color', 'rgb(25, 70, 120)');
  await expect(page.locator('static-element p')).toHaveText('Static component rendered on server');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(240, 245, 250)');
  const image = await page.locator('h1').evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(image).toMatch(/\/assets\/marker-[^/]+\.svg/);
  expect((await request.get(image.slice(5, -2))).status()).toBe(200);
  expect(scripts.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => Boolean(customElements.get('static-element')))).toBe(false);
  await page.evaluate(() => { Object.assign(window, { staticRouteDocument: document }); });
  await page.getByRole('link', { name: 'Interactive route' }).click();
  await expect(page.locator('production-counter button')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { staticRouteDocument?: Document }).staticRouteDocument === document)).toBe(true);
  expect((await request.get('/')).status()).toBe(200);
});

test('ordinary JS-imported CSS is linked once without an inline duplicate or helper refetch', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => { if (request.resourceType() === 'stylesheet') requests.push(request.url()); });
  const response = await page.goto('/imported');
  const text = await response!.text();
  expect(text).not.toContain('<style');
  await page.waitForFunction(() => customElements.get('imported-element'));
  await expect(page.locator('imported-element p')).toHaveCSS('color', 'rgb(100, 20, 80)');
  expect(requests).toHaveLength(1);
});

test('the example application also runs from an independent copied deployment', async ({ page, request }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const response = await page.goto('http://127.0.0.1:4186/listings');
  expect(response!.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Listings', exact: true, level: 1 })).toBeVisible();
  expect((await request.get('http://127.0.0.1:4186/login')).status()).toBe(200);
  expect(failures).toEqual([]);
});

test('copied docs and bookstore render without authoring sources or a disk manifest', async ({ page, request }) => {
  const scripts: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  const response = await page.goto('http://127.0.0.1:4186/docs/first-page');
  expect(response?.status()).toBe(200);
  expect(await response!.text()).toContain('--shiki-dark');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your first page');
  await expect(page.locator('docs-code').first().getByRole('button', { name: /Copy/ })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Color theme' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const markdown = await request.get('http://127.0.0.1:4186/documentation/receiving-stock.md');
  expect(markdown.status()).toBe(200);
  expect(await markdown.text()).toContain('catalog.receive(');
  await page.goto('http://127.0.0.1:4186/bookstore/shop/chapter-house');
  await expect(page.getByRole('link', { name: 'The Native Web', exact: true })).toBeVisible();
  expect(scripts.some(url => /shiki|oniguruma|remark|rehype/.test(url))).toBe(false);
});

test('production first load and repeated real Chromium interactions', async ({ page }, testInfo) => {
  const failures: string[] = [];
  const cssRequests: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('request', (request) => { if (request.resourceType() === 'stylesheet') cssRequests.push(request.url()); });
  await page.goto('/interactive');
  const button = page.getByRole('button', { name: 'Count: 0', exact: true });
  await expect(button).toBeVisible();
  await page.waitForFunction(() => customElements.get('production-counter'));
  await expect(button).toHaveCSS('padding-top', '8px');
  const firstLoad = await page.evaluate(async () => {
    const host = document.querySelector('production-counter') as HTMLElement & { updateComplete: Promise<boolean> };
    await host.updateComplete;
    const enhancedReadyMs = performance.now();
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { responseStartMs: navigation.responseStart, domContentLoadedMs: navigation.domContentLoadedEventEnd,
      loadMs: navigation.loadEventEnd, enhancedReadyMs, resources: performance.getEntriesByType('resource').map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return { url: resource.name, transferBytes: resource.transferSize, decodedBytes: resource.decodedBodySize };
      }) };
  });
  // Measure inside Chromium during actual Playwright pointer clicks; exclude IPC
  // and assertion polling. End at Lit update completion + one animation frame.
  await page.evaluate(() => {
    const host = document.querySelector('production-counter') as HTMLElement & { updateComplete: Promise<boolean> };
    const button = host.querySelector('button')!;
    window.interactionDurations = [];
    button.addEventListener('click', async () => {
      const start = performance.now();
      // Capturing listener runs before the component event handler.
      await Promise.resolve();
      await host.updateComplete;
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
      window.interactionDurations.push(performance.now() - start);
    }, { capture: true });
  });
  for (let i = 1; i <= 10; i++) {
    await page.getByRole('button').click();
    await expect(page.getByRole('button')).toHaveText(`Count: ${i}`);
    await page.waitForFunction((length) => window.interactionDurations.length === length, i);
  }
  const interactions = await page.evaluate(() => window.interactionDurations);
  await expect(page.getByRole('button')).toHaveText('Count: 10');
  expect(failures).toEqual([]);
  expect(cssRequests).toEqual([]);
  const report = { browser: page.context().browser()!.version(), firstLoad, clickToUpdateAndFrameMs: interactions };
  console.log('PHASE5_MEASUREMENTS=' + JSON.stringify(report));
  await testInfo.attach('production-measurements.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});

test('production interactive SSR remains readable with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4185/interactive');
    await expect(page.getByRole('button')).toHaveText('Count: 0');
    await expect(page.getByRole('button')).toHaveCSS('padding-top', '8px');
  } finally { await context.close(); }
});

test('linked CSS and legacy whole-sheet aliases each deliver one copy', async ({ page, request }) => {
  const response = await request.get('/linked');
  const text = await response.text();
  expect(text).not.toContain('<style');
  expect(text).toMatch(/rel="stylesheet" href="\/assets\/page-[^"]+\.css"/);
  await page.goto('/linked');
  await expect(page.locator('h1')).toHaveCSS('color', 'rgb(25, 70, 120)');
  for (const route of ['/legacy', '/all']) {
    const html = await (await request.get(route)).text();
    expect(html).toContain('<style data-lithono-css>');
    expect(html).not.toContain('rel="stylesheet"');
    expect(html.match(/color: rgb\(25 70 120\)/g)).toHaveLength(1);
  }
});
