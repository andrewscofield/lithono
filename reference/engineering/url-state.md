# URL state

URL query state is shareable, bookmarkable state. Define its schema once with the
browser-safe `lithono/url` entry point and use the same definition in loaders and
client components. The module has no rendering, server, or Lit dependencies.

```ts
import { defineQuery, query } from 'lithono/url';

export const filters = defineQuery({
  search: query.string(),
  sort: query.enum(['recent', 'name'], { default: 'recent' }),
  page: query.integer({ default: 1, min: 1 }),
  archived: query.boolean(),
  tags: query.array(query.string()),
});

// In a server loader, using the native Request:
const values = filters.read(request.url);
// values.page is number, values.sort is 'recent' | 'name'.
```

## Parsing and validation

`read` accepts an absolute URL string, query string, `URL`, or `URLSearchParams`.
Missing values use codec defaults. Invalid values also use defaults unless you
call `read(input, { invalid: 'throw' })`, which throws `QueryValidationError` with
an `issues` array containing the key, original strings, and validation message.
Use the same policy on the server and client. Reading never rewrites the URL.

- `query.string({ default?, validate? })`: defaults to `''`; empty strings are
  valid unless the predicate rejects them.
- `query.enum(['a', 'b'], { default: 'a' })`: exact, case-sensitive strings;
  the default is required and inferred as a member of the enum.
- `query.integer({ default?, min?, max? })`: defaults to `0`; accepts signed
  decimal safe integers only. Fractions, whitespace, empty values, exponents,
  and out-of-range values are invalid. Supply a valid default when using bounds.
- `query.boolean({ default? })`: defaults to `false`; only `true` and `false`
  are accepted. For GET checkboxes, set `value="true"` explicitly.
- `query.array(item, { default? })`: repeated parameters, preserving order and
  duplicates. Defaults to `[]`. Invalid items invalidate the entire array.
  Items must encode exactly one string. With a nonempty array default, an empty
  array cannot be represented by repeated keys and writing it throws.

Scalar duplicates are invalid, rather than silently choosing a first or last
value. Built-in defaults are validated at codec construction. Returned records
and built-in arrays are frozen. Custom codecs implement `QueryCodec<T>`; they
must validate runtime inputs, provide a valid default, and round-trip their
serialized values.

`write(input, patch)` returns a new `URLSearchParams`, validates patched values,
and preserves unrelated parameters (including repeats). Defaults are omitted;
`undefined` resets a field to its default. Only patched keys are canonicalized.
Unknown patch keys and invalid or unrepresentable values throw. No source
object is mutated, and a failing patch produces no partial write.

## Native GET forms are the baseline

```html
<form method="get" action="/items">
  <label>Search <input name="search" type="search"></label>
  <select name="sort">
    <option value="recent">Recent</option>
    <option value="name">Name</option>
  </select>
  <label><input name="archived" type="checkbox" value="true"> Archived</label>
  <button type="submit">Search</button>
</form>
```

Without JavaScript this uses document navigation and normal server loaders.
With JavaScript, same-origin GET forms use the shared router automatically:
hydrated pages refresh their loaders in place and retain the shell and form.
Render current values into controls on the server.
Repeated controls with the same name produce arrays. Native GET submission
replaces the action's query string: include hidden controls for unrelated query
parameters that must survive submission. For a nonempty array default, provide
at least one selection or choose an empty default.

## Client state and effects

```ts
import { createUrlState } from 'lithono/client';

const state = createUrlState(filters);
const unsubscribe = state.subscribe(({ values }) => renderFilters(values));
state.start(); // Listen for back/forward (idempotent).

await state.patch({ page: 2 }, { history: 'push', effect: 'navigate' });
await state.patch({ search: 'hello', page: 1 }, {
  history: 'replace', effect: 'local',
});

unsubscribe();
state.dispose();
```

Both `history` and `effect` are required on every patch:

| Effect | Behavior |
| --- | --- |
| `navigate` | Uses the shared client router; keeps common layouts and refreshes the destination. Custom environments and standalone usage without a router retain `location.assign`/`replace`. |
| `local` | One history write and one subscriber notification; no loader execution. |
| `revalidate` | Same atomic history update, followed by the injected refresh callback. |

For local/revalidate writes, unrelated query keys, the path, fragment, and existing
`history.state` are preserved. An explicit patch always performs its requested
write, even if the resulting URL matches the current URL. Navigation does not
publish a speculative client snapshot before the destination loads.

`current` is an immutable `{ values, href, generation }` snapshot. `subscribe`
immediately delivers it and returns an idempotent unsubscribe function.
Subscriptions run synchronously; handlers should not throw. `start` synchronizes
with the current URL and listens for history traversal and Lithono URL changes.
`stop` removes those listeners and invalidates pending refreshes; patches still work while stopped.
`dispose` additionally removes subscribers and permanently closes the state.
Each mounted consumer should have clear lifecycle ownership of its state.

For multiple components coordinating the same view, share **one state instance**
and subscribe each component to it (for example, a page-owned instance passed
through properties or context). Started browser instances also receive each
other’s URL writes and router transitions through `lithono:url-change`.
Subscribe/unsubscribe per component; let the
page owner start/stop/dispose the shared instance.

Back/forward updates subscribers. When the shared router is running it owns the
server refresh, avoiding duplicate requests. Standalone state refreshes when a
callback is provided, otherwise it is local; override with `popstateEffect: 'local'`. Other code's
`pushState`/`replaceState` calls do not emit popstate. Use this state's `patch`,
or stop/start to synchronize after external history writes.

## Injecting refresh integration

```ts
const state = createUrlState(filters, {
  async revalidate({ href, signal }) {
    const result = await loadPageForUrl(href, { signal });
    return () => applyPageResult(result);
  },
  onError(error) { showRefreshError(error); },
});
state.start();
await state.patch({ page: 2 }, { history: 'push', effect: 'revalidate' });
await state.refresh(); // Re-run loaders without a history write.
```

`loadPageForUrl`, `applyPageResult`, and `showRefreshError` above are application
integration functions. A revalidate effect requires a callback and
fails before a history write if none exists.

Each patch, popstate, refresh, stop, or disposal invalidates previous requests
and aborts their signal. Refresh receives `{ values, href, generation, signal,
isCurrent }`. Return a **synchronous commit function** to apply results only if
the request is still current, even when the underlying loader ignores abort.
Do not apply results inside the asynchronous callback before returning the
commit. For integrations that must apply inside the callback, check
`isCurrent()` immediately before every synchronous application.

Current patch/refresh failures reject their promise; the URL remains updated.
Popstate failures go to `onError` when supplied. Obsolete request failures and
commits are ignored. Refresh has no pending/error store; expose that in your
integration if needed.

## Lit lifecycle integration

The core is framework-neutral. In a Lit component, subscribe on connection and
call `requestUpdate()` from the subscription. Call `start()` after subscribing;
on disconnection, unsubscribe and `stop()`. Reconnection can reuse the same
state. Use `dispose()` when the component permanently releases it. A small
application-owned ReactiveController can wrap those same methods. Lithono also
exports `UrlController` from `lithono/client`, which reads the request URL during
SSR, manages a component-owned instance, and defaults its refresh integration to
`revalidateUrlState`. For a page-owned state shared across multiple components,
subscribe to that shared instance instead of constructing separate controllers.

```ts
import { createUrlState, revalidateUrlState } from 'lithono/client';

const state = createUrlState(filters, { revalidate: revalidateUrlState });
state.start();
// Pass state to filter, pagination, and view components; each subscribes.
await state.patch({ sort: 'name', page: 1 }, {
  history: 'push', effect: 'revalidate',
});
```

## Testing and server boundaries

Pass `environment` implementing `UrlEnvironment` to use fake history/location
without modifying browser globals. Creation without an environment requires a
browser; `defineQuery`/`query` can be imported and used on the server. Import
the shared schema from `lithono/url`, and the controller factory from
`lithono/client` (or its source module when testing in isolation).
