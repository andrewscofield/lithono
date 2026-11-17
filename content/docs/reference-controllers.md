---
title: Reactive controllers
description: Subscribe to page data, actions, parameters, session projections, and query state from Lit hosts.
section: API reference
---

A controller is a small object attached to a Lit host. It shares the host's connect/disconnect lifecycle without requiring another element in the HTML. Import controllers from `lithono/client`; a host normally extends `LithonoElement` or Lit's `LitElement`.

## Context-backed controllers

Construct each controller once, usually in a class field. The constructor registers it with `host.addController(this)`. These four require a host that is both an `HTMLElement` and a Lit `ReactiveControllerHost`:

| Constructor | `value` type | Fallback when no context value is supplied |
| --- | --- | --- |
| `new PageDataController<T>(host)` | `T`, default generic `unknown` | `getPageData<T>()` |
| `new ActionsController<TActions>(host)` | `InferActionClient<TActions>` | `getActions<TActions>()` |
| `new ParamsController(host)` | `Record<string, string>` | `getParams()` |
| `new SessionController<T>(host)` | `T | undefined`, default generic `unknown` | `getLithonoData().session` |

Each uses a subscribing `ContextConsumer`. Provider changes request host updates. The getters read a snapshot fallback, but that fallback is **not** a global subscription: a component outside a hydrated provider should not expect every route refresh to rerender it automatically. Prefer explicit properties for independent UI or place a subscribed component under the corresponding provider.

`PageDataController` reads page context, not a containing layout's own loader result. `SessionController` sees only the deliberately public session projection, which defaults to null in server-produced boot data. None of these controllers grants server authorization.

## Read page state in a component

```ts title="src/components/catalog-heading/catalog-heading.ts"
import { html, LithonoElement, PageDataController } from 'lithono/client';

type CatalogData = { search: string };

export default class CatalogHeading extends LithonoElement {
  catalog = new PageDataController<CatalogData>(this);

  render() {
    return html`<p>Filter: ${this.catalog.value?.search || 'All books'}</p>`;
  }
}
```

The type parameter is your contract assertion. It does not validate an arbitrary provider at runtime. For actions, import the action map **type** from a route with `import type`; importing its server implementation into a component violates the client boundary. Action calls run in the browser and reject on failure; see [action transport](/docs/reference-navigation#action-client-integration).

## UrlController

`new UrlController<S>(host, definition, options = {})` is the Lit adapter for [URL state](/docs/reference-url-state). Here the host only needs `ReactiveControllerHost`; `definition` is a `QueryDefinition<S>` and options are `UrlStateOptions<S>`.

| Member | Behavior |
| --- | --- |
| `value` | Typed `QueryValues<S>`; before state creation, reads the SSR/current boot URL through the definition |
| `state` | Lazily creates `createUrlState(definition, options)` with `revalidateUrlState` as the default refresh callback |
| `hostConnected()` | Starts browser state and subscribes to request host updates |
| `hostDisconnected()` | Unsubscribes and stops state; reconnect can restart it |
| `dispose()` | Disconnects and permanently disposes the created state |

Construction and `value` reads are SSR-safe. Accessing `state` on the server requires an explicit `environment`; ordinary `createUrlState` needs browser location/history. Connect skips browser work when neither a browser nor a custom environment exists.

```ts
import { LithonoElement, UrlController } from 'lithono/client';
import { defineQuery, query } from 'lithono/url';

const filters = defineQuery({ page: query.integer({ default: 1, min: 1 }) });

export default class CatalogPager extends LithonoElement {
  filters = new UrlController(this, filters);

  next = async () => {
    await this.filters.state.patch(
      { page: this.filters.value.page + 1 },
      { history: 'push', effect: 'revalidate' },
    );
  };
}
```

Handle a current patch/refresh failure at the interaction boundary. `options.onError` handles event-triggered failures; it does not replace handling direct async operations.

## Cleanup and related APIs

Context subscriptions follow their consumer's lifecycle. URL state has explicit stop/dispose behavior because it owns history listeners and pending refreshes. Do not create controllers in `render()`, where every update would add another instance.

Use [context and decorators](/docs/reference-context) when you need custom providers or prefer decorated fields. Use [component helpers](/docs/reference-elements) for one-off snapshot reads. [The executable lifecycle checkpoint](/docs/executable-examples) provides the full source and browser verification for subscriptions, refreshes, history, and reconnects.
