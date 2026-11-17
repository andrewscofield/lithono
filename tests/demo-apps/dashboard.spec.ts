import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    dashboardTextarea?: Element;
    dashboardPopListeners?: Set<EventListenerOrEventListenerObject>;
    disconnectedDashboard?: {
      view: HTMLElement & { data: { metrics: unknown[] } };
      parent: HTMLElement | null;
      next: ChildNode | null;
    };
  }
}

async function signup(page: Page, name: string, enhanced = true) {
  await page.goto('/dashboard?range=30&campaign=handoff');
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(`${name}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('dashboard-password-123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?range=30&campaign=handoff$/);
  await expect(page.locator('dashboard-notes textarea')).toBeVisible();
  if (!enhanced) return;
  await expect(page.locator('[defer-hydration]')).toHaveCount(0);
  await page.locator('dashboard-view').evaluate(async node => {
    await customElements.whenDefined('dashboard-view');
    await (node as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
  });
  await page.waitForLoadState('load');
}

test('dashboard preserves drafts, focus and identity across status refresh; URL/history, controls and delay are independent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await signup(page, 'dashboard-enhanced');
  await expect(page.locator('[defer-hydration]')).toHaveCount(0);
  expect(await page.evaluate(() => !!customElements.get('wa-switch'))).toBe(false);
  const notes = page.getByLabel('Notes', { exact: true });
  await notes.fill('Local draft survives unrelated status refresh');
  await notes.evaluate(el => { el.setAttribute('data-original', 'yes'); window.dashboardTextarea = el; });
  const form = page.locator('dashboard-status form').first();
  await form.locator('select').selectOption('active');
  await notes.focus();
  await form.evaluate(el => (el as HTMLFormElement).requestSubmit());
  await expect(form.locator('strong')).toHaveText('active');
  await expect(notes).toHaveValue('Local draft survives unrelated status refresh');
  await expect(notes).toBeFocused();
  await expect(page.locator('[data-status-feedback]')).toContainText('Status saved (1)');
  expect(await notes.evaluate(el => el === window.dashboardTextarea)).toBe(true);
  await expect(page.locator('dashboard-notes')).toHaveCount(1);
  await page.getByRole('button', { name: 'Load delayed widget', exact: true }).click();
  await expect(page.getByText('Loading optional counter…')).toBeVisible();
  await notes.fill('Typed while widget loads');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByText('Project notes saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delayed counter: 0' })).toBeVisible();
  await page.getByRole('button', { name: 'Delayed counter: 0' }).click();
  await expect(page.getByRole('button', { name: 'Delayed counter: 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Chart controls', exact: true }).click();
  await expect(page.locator('wa-switch')).toBeVisible();
  await page.locator('wa-switch').evaluate(async () => { await customElements.whenDefined('wa-switch'); });
  await page.locator('wa-switch').click();
  await expect(page.locator('dashboard-chart')).toBeHidden();
  await expect(page.getByRole('table')).toBeVisible();
  await notes.fill('Range changes keep this local draft');
  await page.getByLabel('Date range').selectOption('7');
  await page.getByRole('button', { name: 'Update dashboard', exact: true }).click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Delayed counter: 1' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('campaign')).toBe('handoff');
  await expect(notes).toHaveValue('Range changes keep this local draft');
  await page.goBack();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(30);
  await expect(notes).toHaveValue('Range changes keep this local draft');
  await page.goForward();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(7);
  await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Harbor redesign' });
  await page.getByRole('button', { name: 'Update dashboard', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Project summary' })).toContainText('Harbor redesign');
  await expect(notes).toHaveValue('Planning notes for Harbor redesign.');
  await page.goBack();
  await expect(notes).toHaveValue('Typed while widget loads');
  await page.reload();
  await expect(notes).toHaveValue('Typed while widget loads');
  await notes.fill('Second save without navigation');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.locator('dashboard-notes form')).toHaveAttribute('data-state', 'success');
  await notes.fill('Third save without navigation');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.locator('dashboard-notes form')).toHaveAttribute('data-state', 'success');
  await page.reload();
  await expect(notes).toHaveValue('Third save without navigation');
  expect(errors).toEqual([]);
});

test('native dashboard GET/POST and auth return work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: 'http://127.0.0.1:4197' });
  const page = await context.newPage();
  await signup(page, 'dashboard-native', false);
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(30);
  await page.getByRole('navigation', { name: 'Projects', exact: true }).getByRole('link', { name: 'Harbor redesign' }).click();
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('Planning notes for Harbor redesign.');
  await page.getByLabel('Date range').selectOption('7');
  await page.getByRole('button', { name: 'Update dashboard', exact: true }).click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(7);
  const form = page.locator('dashboard-status form').first();
  const selectedUrl = page.url();
  await form.locator('select').selectOption('active');
  await form.locator('button').click();
  await expect(form.locator('strong')).toHaveText('active');
  await expect(page).toHaveURL(selectedUrl);
  await page.getByLabel('Notes', { exact: true }).fill('Saved with native POST');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('Saved with native POST');
  await expect(page).toHaveURL(selectedUrl);
  await page.reload();
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('Saved with native POST');
  const projectId = await page.locator('dashboard-notes [name=projectId]').inputValue();
  const invalid = await page.request.post('/dashboard?_action=saveNotes', { headers: { referer: page.url() }, form: {
    projectId, version: '2', notes: '</textarea><script>bad()</script>' + 'x'.repeat(4001),
  } });
  expect(invalid.status()).toBe(400);
  expect(await invalid.text()).toContain('&lt;/textarea&gt;');
  expect(await invalid.text()).not.toContain('<script>bad()</script>');
  const conflict = await page.request.post('/dashboard?_action=saveNotes', { headers: { referer: page.url() }, form: { projectId, version: '1', notes: 'Stale native draft' } });
  expect(conflict.status()).toBe(409);
  expect(await conflict.text()).toContain('Stale native draft');
  expect(await conflict.text()).toMatch(/name="version" value="1"/);
  await context.close();
});

test('notes typed into native SSR before enhancement survive hydration and unrelated refresh', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await signup(page, 'dashboard-early-draft');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*', async route => {
    if (/@lithono\/bootstrap|framework\/client\/bootstrap\.(?:ts|js)|virtual:lithono-bootstrap|\/assets\/[^/?]*bootstrap[^/?]*\.js/.test(route.request().url())) await gate;
    await route.continue();
  });
  await page.goto('/dashboard', { waitUntil: 'commit' });
  const notes = page.getByLabel('Notes', { exact: true });
  await notes.fill('Draft before enhancement');
  expect(await page.evaluate(() => !!customElements.get('dashboard-notes'))).toBe(false);
  release();
  await expect(page.locator('[defer-hydration]')).toHaveCount(0);
  await page.locator('dashboard-notes').evaluate(async node => {
    await customElements.whenDefined('dashboard-notes');
    await (node as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
  });
  await expect(notes).toHaveValue('Draft before enhancement');
  const status = page.locator('dashboard-status form').first();
  await status.locator('select').selectOption('active');
  await status.evaluate(form => (form as HTMLFormElement).requestSubmit());
  await expect(status.locator('strong')).toHaveText('active');
  await expect(notes).toHaveValue('Draft before enhancement');
  expect(errors).toEqual([]);
});

test('dashboard rejects cross-workspace actions and notes conflicts preserve a focused draft during a server update', async ({ page, browser }) => {
  await signup(page, 'dashboard-owner');
  const projectId = await page.locator('dashboard-notes [name=projectId]').inputValue();
  const milestoneId = await page.locator('dashboard-status [name=milestoneId]').first().inputValue();
  const otherContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4197' });
  const other = await otherContext.newPage();
  await signup(other, 'dashboard-other');
  for (const [action, form] of [
    ['saveNotes', { projectId, notes: 'intrusion', version: '1' }],
    ['changeStatus', { projectId, milestoneId, status: 'done' }],
  ] as const) {
    const response = await other.request.post(`/dashboard?_action=${action}`, { form,
      headers: { accept: 'application/json' } });
    expect(response.status()).toBe(404);
  }
  expect((await other.request.get(`/dashboard?project=${encodeURIComponent(projectId)}`)).status()).toBe(404);
  await otherContext.close();
  const notes = page.getByLabel('Notes', { exact: true });
  await notes.fill('Do not overwrite my local draft');
  const response = await page.request.post('/dashboard?_action=saveNotes', { form: { projectId, notes: 'Concurrent server note', version: '1' },
    headers: { accept: 'application/json' } });
  expect(response.status()).toBe(200);
  const form = page.locator('dashboard-status form').first();
  await form.locator('select').selectOption('active');
  await notes.focus();
  await form.evaluate(el => (el as HTMLFormElement).requestSubmit());
  await expect(form.locator('strong')).toHaveText('active');
  await expect(notes).toHaveValue('Do not overwrite my local draft');
  await expect(notes).toBeFocused();
  await expect(page.locator('dashboard-notes [name=version]')).toHaveValue('1');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.locator('dashboard-notes [data-form-error]')).toContainText('Notes changed on the server');
  await expect(notes).toHaveValue('Do not overwrite my local draft');
  await page.reload();
  await expect(notes).toHaveValue('Concurrent server note');
  await notes.fill('Reapplied after comparing');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.locator('dashboard-notes form')).toHaveAttribute('data-state', 'success');
  await page.reload();
  await expect(notes).toHaveValue('Reapplied after comparing');
  const notesForm = page.locator('dashboard-notes form');
  await notesForm.evaluate(form => { (form as HTMLFormElement).noValidate = true; });
  await notes.evaluate(el => { (el as HTMLTextAreaElement).value = 'x'.repeat(4001); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(notesForm.locator('[data-error-for=notes]')).toContainText('at most 4000');
  await expect(notes).toHaveValue('x'.repeat(4001));
  await notes.fill('Recovered after validation');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(notesForm).toHaveAttribute('data-state', 'success');
});

test('dashboard disconnect cancels URL subscriptions and pending enhancement; reconnect installs exactly one listener', async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<EventListenerOrEventListenerObject>();
    window.dashboardPopListeners = listeners;
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === 'popstate') listeners.add(listener);
      add(type, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      if (type === 'popstate') listeners.delete(listener);
      remove(type, listener, options);
    }) as typeof window.removeEventListener;
  });
  await signup(page, 'dashboard-lifecycle');
  const initial = await page.evaluate(() => window.dashboardPopListeners!.size);
  await page.getByRole('button', { name: 'Load delayed widget', exact: true }).click();
  await page.evaluate(() => {
    const view = document.querySelector('dashboard-view') as HTMLElement & { data: { metrics: unknown[] } };
    window.disconnectedDashboard = { view, parent: view.parentElement, next: view.nextSibling };
    view.remove();
  });
  expect(await page.evaluate(() => window.dashboardPopListeners!.size)).toBe(initial - 1);
  // Wait longer than the explicitly documented delay; detached hosts must not import it.
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => !!customElements.get('dashboard-counter'))).toBe(false);
  await page.evaluate(() => {
    const { view, parent, next } = window.disconnectedDashboard!;
    parent!.insertBefore(view, next);
  });
  await expect.poll(() => page.evaluate(() => window.dashboardPopListeners!.size)).toBe(initial);
  let release!: () => void;
  let fetched!: () => void;
  let finished!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fetchedGate = new Promise<void>(resolve => { fetched = resolve; });
  const finishedGate = new Promise<void>(resolve => { finished = resolve; });
  let intercepted = false;
  await page.route('**/dashboard?**', async route => {
    if (intercepted || route.request().headers()['x-lithono-revalidate'] !== '1' || new URL(route.request().url()).searchParams.get('range') !== null) return route.continue();
    intercepted = true;
    const response = await route.fetch();
    fetched();
    await gate;
    await route.fulfill({ response });
    finished();
  });
  await page.getByLabel('Date range').selectOption('7');
  await page.getByRole('button', { name: 'Update dashboard', exact: true }).click();
  await fetchedGate;
  await page.evaluate(() => window.disconnectedDashboard!.view.remove());
  expect(await page.evaluate(() => window.dashboardPopListeners!.size)).toBe(initial - 1);
  release();
  await finishedGate;
  expect(await page.evaluate(() => window.disconnectedDashboard!.view.data.metrics.length)).toBe(30);
  await page.evaluate(() => {
    const { view, parent, next } = window.disconnectedDashboard!;
    parent!.insertBefore(view, next);
  });
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(7);
  await expect.poll(() => page.evaluate(() => window.dashboardPopListeners!.size)).toBe(initial);
  await page.getByRole('button', { name: 'Load delayed widget', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delayed counter: 0' })).toBeVisible();
});

test('login returns to the requested dashboard and both auth routes reject unsafe next targets', async ({ page }) => {
  await signup(page, 'dashboard-login');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/dashboard?range=30');
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('Email', { exact: true }).fill('dashboard-login@example.test');
  await page.getByLabel('Password', { exact: true }).fill('dashboard-password-123');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?range=30$/);
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(30);
  for (const path of ['login', 'register']) for (const next of ['//evil.test/', 'https://evil.test/', '/\\evil.test/']) {
    const response = await page.request.get(`/${path}?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe('/listings');
  }
});
