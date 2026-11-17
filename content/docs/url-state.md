---
title: URL-backed view state
description: Make inventory search, filters, and pagination shareable without confusing them with temporary UI state.
section: Learn Lithono
---

If a view should survive refresh, be bookmarkable, or participate in Back/Forward, consider the URL as its owner. Search terms, genres, sort order, and pagination commonly qualify. An unsaved delivery note usually does not.

## Start with a GET form

```html
<form method="get" action="/inventory">
  <label>Find a book <input name="q" type="search" /></label>
  <button>Search</button>
</form>
```

This already produces a useful, linkable URL. A page does not need a reactive state abstraction just to submit a search term.

## Share one query contract

```ts title="src/lib/catalog-query.ts"
import { defineQuery, query } from 'lithono/url';

export const catalogQuery = defineQuery({
  q: query.string({ default: '' }),
  sort: query.enum(['title', 'stock'], { default: 'title' }),
  page: query.integer({ default: 1, min: 1 }),
});
```

The server reads `catalogQuery.read(url)`. Browser subscribers use the same definition. Invalid values fall back to defaults unless you request strict reading with `{ invalid: 'throw' }`.

`write` returns `URLSearchParams`, removes values equal to defaults, and preserves unrelated parameters. Reset pagination in the same patch as a filter change.

## Coordinate multiple browser consumers

```ts title="Browser lifecycle sketch"
import { createUrlState, revalidateUrlState } from 'lithono/client';
import { catalogQuery } from '@/lib/catalog-query.ts';

const state = createUrlState(catalogQuery, {
  revalidate: revalidateUrlState,
});
const unsubscribe = state.subscribe(snapshot => {
  console.log(snapshot.values.q, snapshot.values.page);
});
state.start();

await state.patch({ q: 'gardens', page: 1 }, {
  history: 'push',
  effect: 'revalidate',
});

// On disconnection:
unsubscribe();
state.dispose();
```

Create the state in browser lifecycle code, not while server-rendering a module. This sketch shows the lifecycle explicitly; a real component stores the instance and subscription and disposes them on disconnect.

## Choose history and effects explicitly

Use `history: 'push'` for a meaningful new view and `replace` for replacing the current history entry, such as a debounced adjustment.

- `effect: 'navigate'` performs navigation through the shared router when available.
- `effect: 'revalidate'` updates the URL and runs the supplied refresh callback.
- `effect: 'local'` updates URL subscribers without requesting fresh server data.

Do not use a local-only patch when the displayed records depend on the server interpreting the new filter.

## Races and Back/Forward

Each update invalidates obsolete refresh work. Custom callbacks can return a commit function that only applies while their request is current.

Started browser instances observe router transitions and other instances' URL writes. The router owns the server refresh on Back/Forward while active; subscribers should not add a second independent refresh listener.

Custom environments retain their explicit adapter behavior. See [the full reference](/docs/reference-url-state) for lifecycle, callback, snapshot, and option details. [The executable lifecycle example](/docs/executable-examples) supplies a complete `UrlController` application with verified query changes, Back/Forward, disconnect, and reconnect behavior.
