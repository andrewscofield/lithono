---
title: Coming from TanStack Start
description: Translate React route loaders and server functions into explicit server projections and action-backed HTML.
section: Coming from…
---

This guide focuses on TanStack Start's React integration and TanStack Router. Keep the distinction between route loading, server execution, and client caching: they are related but separate concerns.

## Loading is not automatically server execution

In TanStack Start, route loaders participate in router execution. Server functions encapsulate server-only work and can be called from loaders or browser code through generated transport.

```ts title="TanStack Start — illustrative server function and loader"
import { createServerFn } from '@tanstack/react-start';
import { createFileRoute } from '@tanstack/react-router';

const getCatalog = createServerFn().handler(async () => {
  return [{ title: 'The Native Web', stock: 8 }];
});

export const Route = createFileRoute('/books')({
  loader: () => getCatalog(),
});
```

Lithono's page and layout loaders run on the server. Return the data needed by the template:

```ts title="Lithono — src/pages/books/page.ts"
export function loader() {
  return { books: [{ title: 'The Native Web', stock: 8 }] };
}
```

```html title="Lithono — src/pages/books/page.html"
<ul>
  <lithono-each items="${data.books}" as="book" key="title">
    <li>${book.title}: ${book.stock} copies</li>
  </lithono-each>
</ul>
```

`data.books` comes from the loader. Inside the loop, `book` is the declared local item, so its properties remain `book.title` and `book.stock`.

## Mutate with a named action

TanStack Start server functions support validated server operations, including form-oriented use. In Lithono, a route's `actions` export defines named operations, and its template uses the generated action URL.

Authorization and domain validation still belong in the endpoint. A protected route UI is not the only way a server operation can be reached.

The [receiving workflow](/docs/receiving-stock) shows an actual mutation with a transaction, a stale-version check, and replay protection.

## URL state has a familiar role

TanStack Router gives search parameters a first-class place in application state. In Lithono, begin with a GET form, then share a `defineQuery` contract between the server and browser where coordination is needed.

`createUrlState` makes history and effects explicit: navigate, refresh loader data, or update local URL subscribers. It is not a replacement for all TanStack Router APIs or its route-type system.

## Distinguish loader snapshots from a client cache

TanStack Query is optional in the TanStack ecosystem and provides its own client cache, query lifecycle, and invalidation model. Lithono's loader reconciliation is not a normalized entity cache or a drop-in Query replacement.

Use the server snapshot as the rendered view, keep temporary interaction state in its component, and add a separate client data library only when the application actually needs its behavior.

## Component and lifecycle differences

React effects and state do not map one-for-one onto web component methods. A custom element connects and disconnects from the document; it should subscribe, allocate resources, and clean up accordingly.

Lit reactive fields drive template updates. Browser-only widgets own a dedicated container. See [components](/docs/components).

## Styling and runtime

Tailwind classes can be used in Lithono HTML templates. The utility syntax does not require React. React-specific UI packages still need a separate interoperability decision.

Evaluate deployment and streaming needs against Lithono's current Node buffered-SSR support rather than assuming TanStack Start's capabilities carry over.

### Official background

- [TanStack Start server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [TanStack Router documentation](https://tanstack.com/router/latest/docs/framework/react/overview)
