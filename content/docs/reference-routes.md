---
title: Page and layout module contracts
description: Reference server route exports, loader concurrency, metadata, middleware, error templates, and hydration decisions.
section: API reference
---

Files named `page.ts`, `layout.ts`, and related route roles are server modules. Their sibling HTML becomes a separate generated component. Import route types from `lithono` and browser APIs from `lithono/client`.

## PageModule

`PageModule<TLoaderData, TActions>` describes these named exports:

| Export | Signature / default |
| --- | --- |
| `loader` | `(ctx: RequestContext) => TLoaderData | Promise<TLoaderData>`; optional |
| `actions` | Record of action definitions; optional |
| `meta` | `({ data, params, url }) => PageMeta`; optional, default title is `Lithono` |
| `hydrate` | Optional boolean override for generated page enhancement |
| `prerender` | Optional boolean; `true` is rejected at startup as unsupported |

`PageMeta` requires `title: string` and optionally accepts `description: string`. Metadata is synchronous and receives the completed loader result. There is no arbitrary head-tag API in this contract; use the application document for static head markup.

```ts title="src/pages/bookstore/page.ts"
import type { Loader, PageMeta } from 'lithono';

export function loader({ url }: Loader) {
  return { search: url.searchParams.get('q') ?? '' };
}

export function meta({ data }: { data: ReturnType<typeof loader> }): PageMeta {
  return { title: data.search ? `Search: ${data.search}` : 'Chapter House' };
}
```

Use `${data.search}` in `page.html`. The shorthand remains supported, but new documentation uses explicit `data.*`. This convention does not add semantic TypeScript checking to HTML expressions.

## LayoutModule and loader ordering

`LayoutModule<TLoaderData>` supports `loader(ctx)` with the same result contract and an optional `hydrate` boolean. Put `${children}` in `layout.html` where the nested route should render. A `layout.ts` without a renderable `layout.html` fails discovery.

For one page render, all ancestor layout loaders and the page loader run together with `Promise.all`. They receive the request context; a child loader does not receive a parent loader's output. Put shared request dependencies in [locals](/docs/reference-server#locals-and-request-context), or call a shared server function from each loader.

Page/layout results and public identity projections pass through JSON serialization. Return explicit plain-data projections; functions and provider/database instances are not a transport contract. Read [rendering](/docs/rendering) before returning dates, errors, or large records.

Layout identity is its route-relative module path, including groups, rather than just its custom-element tag. The router retains the common layout ancestry and replaces the first changed outlet. Loaders still rerun during refresh; retained DOM does not mean permanently cached server data.

## HTML pages and resource routes

`page.html` alone can render a static page. Add `page.ts` for loaders, actions, metadata, and options. A `page.ts` without `page.html` is a resource route: GET returns its loader result as JSON; named actions still dispatch through `?_action=name`. It is not an HTML page with an implicit template.

Dynamic `[id]` segments become string params. `[...parts]` supplies a catch-all and `(group)` changes ancestry without adding a URL segment. Static routes precede dynamic routes and catch-alls. Keep helpers outside `src/pages`; [routing](/docs/routing) describes the accepted role filenames.

## MiddlewareModule

`MiddlewareModule` is a Hono middleware handler or an array of handlers. Export it as the default or as `middleware` from `middleware.ts`. Discovery collects middleware from root to leaf, including groups. It runs before the route's locals collection and loader/action work.

```ts title="src/pages/bookstore/middleware.ts"
import type { MiddlewareModule } from 'lithono';

const middleware: MiddlewareModule = async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  await next();
};
export default middleware;
```

Use Hono request state (`c.set`/`c.get` with your own Hono typing) for middleware-to-locals integration. The loader context's locals are not a middleware argument. Authorization for a write must also happen in that action; a layout loader runs concurrently and cannot guard it.

## ErrorModule and special templates

The nearest ancestor `not-found.html` or `error.html`, with optional sibling TypeScript, handles route errors. `HttpError(404, ...)` selects not-found rendering. Other thrown errors select the error template when present, preserving an `HttpError` status or using 500. A thrown `Response`, including `redirect()`, is returned directly.

`ErrorModule` describes an optional `loader(ctx)` and `meta({ data, params, url, error? })`. **Current runtime behavior:** the original error is passed to the special loader as `ctx.error`; metadata is invoked with `data`, `params`, and `url`, without the optional `error` field. Return a suitable public message from the loader if metadata needs it. Do not expose stack traces in loader data.

An unmatched URL can use the root route's not-found template. Without a special template, the fallback is plain text. If rendering a special template itself fails, the normal server error handler takes over.

## Hydration defaults and boundaries

The template compiler enables page hydration for event bindings or exported actions, unless `export const hydrate = true/false` overrides it. Ordinary loader interpolation alone stays server-rendered. Layout templates have their own decision and may also load with a hydrated page. Discovered child components can enhance independently.

The server collects loader results and rendered HTML before writing the response. Neither `PageModule` nor `LayoutModule` currently supplies deferred values, progressive SSR, or an RSC transport. The [navigation reference](/docs/reference-navigation) describes complete-document transitions and snapshot refreshes.
