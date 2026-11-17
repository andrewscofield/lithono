---
title: Context and decorators
description: Reference shared context identities, subscribing decorators, provider scope, and context-root integration.
section: API reference
---

Context shares a value down the rendered element tree without passing it through every intermediate element. Lithono uses `@lit/context`, whose consumers request the nearest provider through DOM events. This is useful for genuinely shared page state; a simple component input is often clearer as a property binding.

## Context exports

Import these stable context identities from `lithono/client`:

| Export | Value type | Built-in provider |
| --- | --- | --- |
| `pageDataContext` | `unknown` | `LithonoPage.data` |
| `actionsContext` | `unknown` | `LithonoPage.providedActions` |
| `paramsContext` | `Record<string, string>` | `LithonoPage.params` |
| `sessionContext` | `unknown` | `LithonoPage.session` |

Import the identity itself rather than inventing another context with a similar name. A nested custom provider can override a value for its descendants. Layout hosts do not automatically provide these four contexts, and page context is not a transport for layout-loader data.

## Subscribing decorators

`@pageData()`, `@actions()`, `@params()`, and `@session()` each wrap `consume({ context, subscribe: true })`. They take no options and return the corresponding Lit context property decorator.

```ts title="src/components/catalog-count/catalog-count.ts"
import { html, LithonoElement, pageData, params } from 'lithono/client';

export default class CatalogCount extends LithonoElement {
  @pageData() catalog: unknown;
  @params() routeParams?: Record<string, string>;

  render() {
    const catalog = this.catalog as { products: readonly { id: string }[] } | undefined;
    return html`<p>${catalog?.products.length ?? 0} books</p>`;
  }
}
```

These decorators subscribe to providers; they do **not** read the global boot snapshot as a fallback. Initialize optional fields or supply a custom provider. For the context-plus-snapshot behavior, use [controllers](/docs/reference-controllers).

The starter config enables `experimentalDecorators: true` and `useDefineForClassFields: false`. Keep those settings for this legacy Lit decorator style. Page/action/session contexts are typed `unknown`: declare decorated fields as `unknown`, then narrow or assert the known application contract when reading them. Lit's decorator typing rejects a consuming field that claims a narrower type than its provider. An assertion is not runtime validation, and a consumed value may be absent before a provider is connected.

## SSR and provider scope

Context delivery depends on connected DOM/event behavior. Do not make the initial SSR output rely solely on a browser subscription firing. Pass required initial values as properties, use a snapshot-aware controller, or render loader values directly in `page.html` with `data.*`.

On a hydrated page, changes to provided reactive properties propagate to subscribed descendants. A static ancestor that never upgrades is not an active provider. Browser bootstrap's context root helps with late providers; it does not manufacture values for a missing provider or authorize an operation.

For your own application context, use `createContext`, `ContextProvider`, or `@provide` from `@lit/context`, with a distinct identity and your own value type. Declare that dependency in your application when importing it directly. Keep private server locals out of public context values.

## attachContextRoot

`attachContextRoot(target: HTMLElement | Document = document.documentElement): ContextRoot` creates and attaches a new root. It buffers unsatisfied context requests so consumers can find providers defined later. Normal Lithono bootstrap already calls it.

This function requires a browser DOM when using the default target. Each call creates another root; it is not an idempotent singleton installer. Advanced custom bootstraps should attach once and retain the returned `ContextRoot` if they need its `detach(target)` cleanup. Do not call it in each component or during server rendering.

## Session and action boundaries

`sessionContext` and `@session()` consume the `auth.publicSession` projection from [server options](/docs/reference-server). The default projection is null, even when server locals contain an authenticated session. The user projection is separately available as `getLithonoData().user`; there is no built-in user context/decorator.

`@actions()` supplies the page's callable action view, whose descriptor fields can also support form markup. Only invoke an action in the browser. Protect the server handler using request identity and owner-scoped queries; a visible button, context value, or hidden field cannot substitute for that check. See [authentication](/docs/authentication). The [executable lifecycle checkpoint](/docs/executable-examples) demonstrates strict decorator field typing, SSR fallback, provider updates, and public session delivery in a complete app.
