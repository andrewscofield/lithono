import { test, expect } from '@playwright/test';

interface Phase2Host extends HTMLElement {
  revalidate(): Promise<void>;
  updateComplete: Promise<boolean>;
  url: URL;
  failure: unknown;
  session: unknown;
  query: { state: { patch(values: Record<string, unknown>, options: Record<string, unknown>): Promise<void> } };
  actionMap: { save(): Promise<unknown> };
}

declare global {
  interface Window {
    ssrNodes: Node[];
  }
}

test('SSR adoption and refresh preserve nested owners, focused drafts, keyed state and layout outlets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/phase2/test?rev=0&filter=hello');
  await page.waitForFunction(() => !!customElements.get('phase2-page') && !document.querySelector('[defer-hydration]')).catch(error => {
    expect(errors, 'browser errors during initial adoption').toEqual([]);
    throw error;
  });
  await expect(page.locator('phase2-page h1')).toHaveText('revision 0');
  await expect(page.locator('#empty-message')).toBeEmpty();
  expect(await page.evaluate(() => window.ssrNodes.every((node: Node) => node.isConnected))).toBe(true);
  await expect(page.locator('#draft')).toBeFocused();
  await expect(page.locator('#draft')).toHaveValue('pre-hydration draft');
  await expect(page.locator('phase2-null output')).toHaveText('{"data":null,"session":null}');
  await page.locator('li[data-key="a"] button').click();
  await page.locator('phase2-shadow button').click();
  await page.locator('.layout-draft').first().fill('layout draft');
  await page.locator('#draft').fill('page draft');
  await page.evaluate(async () => {
    history.replaceState(null, '', '?rev=1&filter=changed#anchor');
    await (document.querySelector('phase2-page') as unknown as Phase2Host).revalidate();
    await Promise.all([...document.querySelectorAll('phase2-layout, phase2-page')].map((host) => (host as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete));
  });
  await expect(page.locator('h1')).toHaveText('revision 1');
  await expect(page.locator('#empty-message')).toHaveText('Ready 1');
  await expect(page.locator('header').first()).toHaveText('outer revision 1');
  await expect(page.locator('header').last()).toHaveText('inner revision 1');
  await expect(page.locator('#draft')).toBeFocused();
  await expect(page.locator('#draft')).toHaveValue('page draft');
  await expect(page.locator('.layout-draft').first()).toHaveValue('layout draft');
  await expect(page.locator('li[data-key="a"] button')).toHaveText('count 1');
  await expect(page.locator('phase2-shadow button')).toHaveText('count 1');
  expect(await page.locator('li').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-key')))).toEqual(['b', 'a', 'c']);
  expect(await page.evaluate(() => window.ssrNodes.every((node: Node) => node.isConnected))).toBe(true);
  await expect(page.locator('#page-consumer output')).toContainText('"revision":1');
  await expect(page.locator('#url')).toContainText('?rev=1&filter=changed#anchor');
  await expect(page.locator('#params')).toHaveText('{"id":"test"}');
  await page.evaluate(() => (document.querySelector('phase2-page') as unknown as Phase2Host).query.state.patch({ filter: 'controller' }, { history: 'replace', effect: 'local' }));
  await expect(page.locator('#query')).toHaveText('controller');
  expect(errors).toEqual([]);
});

test('manual, action and URL-state refreshes use the same request generation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/phase2/test?rev=0');
  await page.waitForFunction(() => !!customElements.get('phase2-page') && !document.querySelector('[defer-hydration]'));
  await page.evaluate(async () => {
    const host = document.querySelector('phase2-page') as unknown as Phase2Host;
    history.replaceState(null, '', '?rev=2&delay=150');
    const older = host.revalidate();
    history.replaceState(null, '', '?rev=3');
    await host.revalidate(); await older;
  });
  await expect(page.locator('h1')).toHaveText('revision 3');
  await page.route('**/*_action=save*', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ response });
  });
  await page.evaluate(async () => {
    const host = document.querySelector('phase2-page') as unknown as Phase2Host;
    host.url = new URL('?rev=4&delay=150', location.href);
    const older = host.actionMap.save();
    history.replaceState(null, '', '?rev=5');
    await host.revalidate(); await older;
  });
  await expect(page.locator('h1')).toHaveText('revision 5');
  await page.evaluate(async () => {
    const { revalidateUrlState } = await import('/src/framework/client/data.ts' as string);
    const { createUrlState } = await import('/src/framework/client/url-state.ts' as string);
    const { defineQuery, query } = await import('/src/framework/url.ts' as string);
    const state = createUrlState(defineQuery({ rev: query.integer({ default: 0 }), delay: query.integer({ default: 0 }) }), { revalidate: revalidateUrlState });
    state.start();
    const older = state.patch({ rev: 7, delay: 150 }, { history: 'push', effect: 'revalidate' });
    await state.patch({ rev: 6, delay: 0 }, { history: 'replace', effect: 'revalidate' });
    await older;
    state.dispose();
  });
  await expect(page.locator('h1')).toHaveText('revision 6');
  expect(errors).toEqual([]);
});

test('identified layout payloads and all page projections update together', async ({ page }) => {
  await page.goto('/phase2/test?rev=0');
  await page.waitForFunction(() => !!customElements.get('phase2-page') && !document.querySelector('[defer-hydration]'));
  await page.evaluate(async () => {
    const { applyRevalidate } = await import('/src/framework/client/data.ts' as string);
    applyRevalidate({ data: { revision: 10, items: ['a', 'b', 'c'] },
      // Deliberately reversed: identities, rather than array positions or tags.
      layouts: [{ id: 'phase2/layout', data: { label: 'inner', revision: 12 } }, { id: 'layout', data: { label: 'outer', revision: 11 } }],
      params: { id: 'updated' }, url: new URL('/phase2/updated?rev=10#fragment', location.href).href,
      session: null, user: null,
    });
  });
  await expect(page.locator('header').first()).toHaveText('outer revision 11');
  await expect(page.locator('header').last()).toHaveText('inner revision 12');
  await expect(page.locator('#params')).toHaveText('{"id":"updated"}');
  await expect(page.locator('#url')).toContainText('/phase2/updated?rev=10#fragment');
  await expect(page.locator('#page-consumer output')).toContainText('"session":null');
  expect(await page.evaluate(() => (document.querySelector('#page-consumer') as unknown as { params: { value: Record<string, string> } }).params.value)).toEqual({ id: 'updated' });
  expect(await page.evaluate(() => window.ssrNodes.every((node: Node) => node.isConnected))).toBe(true);
});

test('overlapping mutations reconcile after the last server commit instead of retaining an earlier snapshot', async ({ page }) => {
  await page.goto('/phase2/test?rev=0');
  await page.waitForFunction(() => !!customElements.get('phase2-page') && !document.querySelector('[defer-hydration]'));
  let requests = 0;
  let commits = 0;
  let reconciliations = 0;
  await page.route('**/phase2/test**', async (route) => {
    const isAction = new URL(route.request().url()).searchParams.has('_action');
    const order = isAction ? ++requests : 0;
    const response = await route.fetch();
    const payload = await response.json();
    if (isAction) {
      if (order === 1) await new Promise((resolve) => setTimeout(resolve, 120));
      payload.meta.refresh.payload.data.revision = ++commits;
    } else {
      reconciliations++;
      payload.data.revision = commits;
    }
    await route.fulfill({ response, json: payload });
  });
  await page.evaluate(async () => {
    const host = document.querySelector('phase2-page') as unknown as Phase2Host;
    const actions = host.actionMap;
    await Promise.all([actions.save(), actions.save()]);
  });
  expect(commits).toBe(2);
  expect(reconciliations).toBe(1);
  await expect(page.locator('h1')).toHaveText('revision 2');
});

test('shared URL state coordinates consumers, retains unrelated keys and restores matching data on Back/Forward and refresh', async ({ page }) => {
  await page.goto('/phase2/test?rev=0&foreign=keep');
  await page.waitForFunction(() => !!customElements.get('phase2-page') && !document.querySelector('[defer-hydration]'));
  await page.evaluate(async () => {
    const { revalidateUrlState } = await import('/src/framework/client/data.ts' as string);
    const { createUrlState } = await import('/src/framework/client/url-state.ts' as string);
    const { defineQuery, query } = await import('/src/framework/url.ts' as string);
    const state = createUrlState(defineQuery({ rev: query.integer({ default: 0 }), filter: query.string() }), { revalidate: revalidateUrlState });
    for (const name of ['filters', 'pagination']) {
      const output = document.createElement('output');
      output.id = `shared-${name}`;
      document.body.append(output);
      state.subscribe(({ values }: { values: { rev: number; filter: string } }) => { output.textContent = `${values.rev}:${values.filter}`; });
    }
    state.start();
    await state.patch({ rev: 1, filter: 'changed' }, { history: 'push', effect: 'revalidate' });
  });
  await expect(page.locator('h1')).toHaveText('revision 1');
  await expect(page.locator('#shared-filters')).toHaveText('1:changed');
  await expect(page.locator('#shared-pagination')).toHaveText('1:changed');
  expect(new URL(page.url()).searchParams.get('foreign')).toBe('keep');
  await page.goBack();
  await expect(page.locator('h1')).toHaveText('revision 0');
  await expect(page.locator('#shared-filters')).toHaveText('0:');
  await page.goForward();
  await expect(page.locator('h1')).toHaveText('revision 1');
  await expect(page.locator('#shared-pagination')).toHaveText('1:changed');
  await page.reload();
  await expect(page.locator('h1')).toHaveText('revision 1');
  await expect(page.locator('#query')).toHaveText('changed');
});

test('native failure keeps URL, params, values and public state through hydration, then clears on refresh', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/phase2/failure?rev=7&filter=retained');
  await page.waitForFunction(() => !!customElements.get('phase2-page') && !document.querySelector('[defer-hydration]'));
  await page.locator('form input').fill('posted draft');
  await Promise.all([page.waitForNavigation(), page.locator('form button').click()]);
  await page.waitForFunction(() => !!customElements.get('phase2-page') && !document.querySelector('[defer-hydration]'));
  await expect(page.locator('form input')).toHaveValue('posted draft');
  await expect(page.locator('#url')).toContainText('/phase2/failure?rev=7&filter=retained');
  await expect(page.locator('#url')).not.toContainText('_action');
  await expect(page.locator('#params')).toHaveText('{"id":"failure"}');
  await expect(page.locator('#failure')).toContainText('"action":"invalid"');
  expect(await page.evaluate(async () => {
    const { getLithonoData } = await import('/src/framework/client/data.ts' as string);
    const boot = getLithonoData();
    const host = document.querySelector('phase2-page') as unknown as Phase2Host;
    return { parity: JSON.stringify(host.failure) === JSON.stringify(boot.failure), user: boot.user, session: host.session };
  })).toEqual({ parity: true, user: { id: 'public', email: 'public@example.test', name: 'Public' }, session: { public: true } });
  await page.evaluate(() => (document.querySelector('phase2-page') as unknown as Phase2Host).revalidate());
  await expect(page.locator('#failure')).toHaveText('');
  expect(errors).toEqual([]);
});
