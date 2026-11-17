import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineQuery, query, QueryValidationError } from '../src/framework/url.ts';
import { createUrlState } from '../src/framework/client/url-state.ts';
import type { UrlEnvironment, UrlRefresh } from '../src/framework/client/url-state.ts';

const shape = {
  search: query.string(),
  sort: query.enum(['recent', 'name'], { default: 'recent' }),
  page: query.integer({ default: 1, min: 1, max: 100 }),
  archived: query.boolean(),
  tags: query.array(query.string()),
};
const definition = defineQuery(shape);

// Type-level contract, also checked with tsc because tests are outside tsconfig's include.
function typeContract() {
  const values = definition.read('');
  const sort: 'recent' | 'name' = values.sort;
  const page: number = values.page;
  const tags: readonly string[] = values.tags;
  void [sort, page, tags];
  // @ts-expect-error Only declared enum members can be patched.
  definition.write('', { sort: 'unknown' });
  // @ts-expect-error Integers are numeric at the API boundary.
  definition.write('', { page: '2' });
  // @ts-expect-error Unknown schema keys are not accepted.
  definition.write('', { extra: true });
}
void typeContract;

class FakeBrowser implements UrlEnvironment {
  entries = [{ href: 'https://example.test/items?foreign=keep#results', state: { router: 'owned' } }];
  index = 0;
  listeners = new Set<EventListener>();
  navigations: { method: string; href: string }[] = [];
  writes: string[] = [];
  location = {
    href: '',
    assign: (href: string) => { this.navigations.push({ method: 'assign', href }); },
    replace: (href: string) => { this.navigations.push({ method: 'replace', href }); },
  };
  history = {
    state: undefined as unknown,
    pushState: (state: unknown, _unused: string, href: string) => {
      this.writes.push('push');
      this.entries.splice(this.index + 1);
      this.entries.push({ href, state: state as { router: string } });
      this.index++;
    },
    replaceState: (state: unknown, _unused: string, href: string) => {
      this.writes.push('replace');
      this.entries[this.index] = { href, state: state as { router: string } };
    },
  };
  constructor(href?: string) {
    // Instance-local closures, without patching any browser globals.
    const self = this;
    Object.defineProperty(this.location, 'href', { get: () => self.entries[self.index].href });
    Object.defineProperty(this.history, 'state', { get: () => self.entries[self.index].state });
    if (href) this.entries[0].href = href;
  }
  addEventListener(_type: 'popstate', listener: EventListener) { this.listeners.add(listener); }
  removeEventListener(_type: 'popstate', listener: EventListener) { this.listeners.delete(listener); }
  back() { if (this.index > 0) { this.index--; this.pop(); } }
  forward() { if (this.index + 1 < this.entries.length) { this.index++; this.pop(); } }
  pop() { for (const listener of [...this.listeners]) listener(new Event('popstate')); }
}
test('server request URLs, URLSearchParams and browser state share typed decoding', () => {
  const href = 'https://example.test/items?search=a%26b&sort=name&page=3&archived=true&tags=one&tags=two&foreign=x';
  const request = new Request(href);
  const server = definition.read(request.url);
  assert.deepEqual({ ...server }, { search: 'a&b', sort: 'name', page: 3, archived: true, tags: ['one', 'two'] });
  assert.deepEqual(server, definition.read(new URL(request.url).searchParams));
  const state = createUrlState(definition, { environment: new FakeBrowser(href) });
  assert.deepEqual(state.current.values, server);
  assert.ok(Object.isFrozen(server));
  assert.ok(Object.isFrozen(server.tags));
  state.dispose();
});

test('defaults, strict validation, duplicates and invalid arrays use one policy', () => {
  const input = '?page=1.5&sort=unknown&archived=on&search=a&search=b&tags=ok';
  const fallback = definition.read(input);
  assert.equal(fallback.page, 1);
  assert.equal(fallback.sort, 'recent');
  assert.equal(fallback.archived, false);
  assert.equal(fallback.search, '');
  assert.throws(() => definition.read(input, { invalid: 'throw' }), (error: unknown) => {
    assert.ok(error instanceof QueryValidationError);
    assert.deepEqual(error.issues.map((issue) => issue.key), ['search', 'sort', 'page', 'archived']);
    return true;
  });
  for (const raw of ['', '1e2', '0x10', 'NaN', 'Infinity', '9007199254740992', '101', '-1']) {
    assert.throws(() => definition.read(`?page=${raw}`, { invalid: 'throw' }), QueryValidationError);
  }
  const numbers = defineQuery({ ids: query.array(query.integer({ min: 0 })) });
  assert.deepEqual(numbers.read('?ids=1&ids=no').ids, []);
  assert.throws(() => numbers.read('?ids=1&ids=no', { invalid: 'throw' }), QueryValidationError);
  assert.throws(() => query.integer({ default: 0, min: 1 }));
  assert.throws(() => query.string({ default: 'bad', validate: (value) => value.length < 2 }));
});

test('writes preserve unrelated repeats, remove defaults and serialize repeated arrays', () => {
  const source = new URLSearchParams('foreign=a&foreign=b&page=4&tags=old&archived=true');
  const next = definition.write(source, { search: 'hello & 世界', page: undefined, archived: false, tags: ['x', 'x', 'y'] });
  assert.deepEqual(next.getAll('foreign'), ['a', 'b']);
  assert.equal(next.has('page'), false);
  assert.equal(next.has('archived'), false);
  assert.deepEqual(next.getAll('tags'), ['x', 'x', 'y']);
  assert.equal(definition.read(next).search, 'hello & 世界');
  assert.equal(source.get('page'), '4');
  assert.throws(() => definition.write(source, { page: 0 }), QueryValidationError);
  assert.throws(() => definition.write(source, { archived: 'false' } as never), QueryValidationError);
  assert.throws(() => definition.write(source, { unexpected: 'x' } as never), QueryValidationError);
  const nonempty = defineQuery({ tags: query.array(query.string(), { default: ['baseline'] }) });
  assert.deepEqual(nonempty.read('').tags, ['baseline']);
  assert.equal(nonempty.write('?tags=other', { tags: undefined }).has('tags'), false);
  assert.throws(() => nonempty.write('', { tags: [] }), /cannot be represented/);
});

test('strict client validation matches server validation before any history mutation', async () => {
  const href = 'https://example.test/items?page=bad';
  assert.throws(() => definition.read(new Request(href).url, { invalid: 'throw' }), QueryValidationError);
  assert.throws(() => createUrlState(definition, { environment: new FakeBrowser(href), invalid: 'throw' }), QueryValidationError);
  const browser = new FakeBrowser();
  const state = createUrlState(definition, { environment: browser, invalid: 'throw' });
  browser.entries[0].href = href;
  await assert.rejects(state.patch({ search: 'ok' }, { history: 'push', effect: 'local' }), QueryValidationError);
  assert.equal(browser.writes.length, 0);
  await state.patch({ page: 2 }, { history: 'replace', effect: 'local' });
  assert.equal(state.current.values.page, 2);
  state.dispose();
});

test('multi-key patches are atomic, retain history state, pathname and hash', async () => {
  const browser = new FakeBrowser();
  const state = createUrlState(definition, { environment: browser });
  const seen: number[] = [];
  state.subscribe((snapshot) => seen.push(snapshot.values.page));
  await state.patch({ page: 3, sort: 'name', tags: ['a', 'b'] }, { history: 'push', effect: 'local' });
  assert.deepEqual(browser.writes, ['push']);
  assert.deepEqual(seen, [1, 3]);
  assert.deepEqual(browser.history.state, { router: 'owned' });
  const url = new URL(browser.location.href);
  assert.equal(url.pathname, '/items');
  assert.equal(url.hash, '#results');
  assert.equal(url.searchParams.get('foreign'), 'keep');
  const previous = state.current;
  await assert.rejects(state.patch({ search: 'valid', page: 0 }, { history: 'replace', effect: 'local' }), QueryValidationError);
  assert.equal(state.current, previous);
  assert.deepEqual(browser.writes, ['push']);
  await state.patch({ page: 2 }, { history: 'replace', effect: 'local' });
  assert.equal(browser.entries.length, 2);
  assert.deepEqual(browser.writes, ['push', 'replace']);
});

test('start/stop/dispose handle back/forward and subscriptions without duplicate listeners', async () => {
  const browser = new FakeBrowser();
  const state = createUrlState(definition, { environment: browser });
  state.start(); state.start();
  assert.equal(browser.listeners.size, 2);
  await state.patch({ page: 2 }, { history: 'push', effect: 'local' });
  await state.patch({ page: 3 }, { history: 'push', effect: 'local' });
  browser.back(); assert.equal(state.current.values.page, 2);
  browser.back(); assert.equal(state.current.values.page, 1);
  browser.forward(); assert.equal(state.current.values.page, 2);
  state.stop(); state.stop();
  assert.equal(browser.listeners.size, 0);
  browser.forward(); assert.equal(state.current.values.page, 2);
  state.start(); assert.equal(state.current.values.page, 3);
  let notifications = 0;
  const unsubscribe = state.subscribe(() => { notifications++; });
  unsubscribe(); unsubscribe();
  await state.patch({ page: 4 }, { history: 'replace', effect: 'local' });
  assert.equal(notifications, 1);
  state.dispose(); state.dispose();
  assert.equal(browser.listeners.size, 0);
  assert.throws(() => state.start(), /disposed/);
  await assert.rejects(state.patch({}, { history: 'push', effect: 'local' }), /disposed/);
});

test('navigation uses document assign/replace; local never refreshes; missing callback fails before history', async () => {
  const browser = new FakeBrowser();
  const state = createUrlState(definition, { environment: browser });
  await assert.rejects(state.patch({ page: 2 }, { history: 'push', effect: 'revalidate' }), /callback/);
  assert.equal(browser.writes.length, 0);
  await state.patch({ page: 2 }, { history: 'push', effect: 'navigate' });
  await state.patch({ page: 3 }, { history: 'replace', effect: 'navigate' });
  assert.deepEqual(browser.navigations.map((entry) => entry.method), ['assign', 'replace']);
  assert.equal(new URL(browser.navigations[0].href).searchParams.get('page'), '2');
  assert.equal(browser.writes.length, 0);
  assert.equal(state.current.values.page, 1);
});

test('refresh generations abort old work and only commit current results, including after local changes and disposal', async () => {
  const browser = new FakeBrowser();
  const requests: { request: UrlRefresh<typeof shape>; resolve: (commit: () => void) => void }[] = [];
  const commits: number[] = [];
  const state = createUrlState(definition, { environment: browser, revalidate: (request) => new Promise<() => void>((resolve) => {
    requests.push({ request, resolve });
  }) });
  const first = state.patch({ page: 2 }, { history: 'push', effect: 'revalidate' });
  const second = state.patch({ page: 3 }, { history: 'push', effect: 'revalidate' });
  assert.ok(requests[0].request.signal.aborted);
  assert.equal(requests[0].request.isCurrent(), false);
  requests[1].resolve(() => commits.push(3)); await second;
  requests[0].resolve(() => commits.push(2)); await first;
  assert.deepEqual(commits, [3]);
  const third = state.refresh();
  await state.patch({ page: 4 }, { history: 'replace', effect: 'local' });
  requests[2].resolve(() => commits.push(99)); await third;
  assert.deepEqual(commits, [3]);
  const fourth = state.refresh(); state.dispose();
  requests[3].resolve(() => commits.push(100)); await fourth;
  assert.deepEqual(commits, [3]);
  assert.ok(requests[3].request.signal.aborted);
});

test('popstate refreshes, failures are reported, and obsolete failures are ignored', async () => {
  const browser = new FakeBrowser();
  const errors: unknown[] = [];
  let loads = 0;
  const state = createUrlState(definition, { environment: browser,
    revalidate: () => { loads++; throw new Error('load failed'); }, onError: (error) => errors.push(error),
  });
  state.start();
  await state.patch({ page: 2 }, { history: 'push', effect: 'local' });
  assert.equal(loads, 0);
  browser.back();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(loads, 1); assert.equal(errors.length, 1);
  await assert.rejects(state.refresh(), /load failed/);
  state.dispose();
  let reject!: (error: Error) => void;
  const other = createUrlState(definition, { environment: browser,
    revalidate: () => new Promise<void>((_resolve, failure) => { reject = failure; }),
  });
  const old = other.refresh();
  await other.patch({ page: 2 }, { history: 'replace', effect: 'local' });
  reject(new Error('obsolete')); await old;
  other.dispose();
});
