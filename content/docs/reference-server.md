---
title: Server integration and plugins
description: Reference Hono application creation, request locals, public auth projections, plugin ordering, and advanced server utilities.
section: API reference
---

Import `createLithonoApp` and server utilities from `lithono/server`. They run under Node with the Lithono Vite integration/generated route graph; they are not browser modules or a standalone filesystem-free route scanner.

## createLithonoApp

`createLithonoApp(options: LithonoAppOptions = {})` synchronously returns a Hono application. Internal asynchronous initialization is awaited by its catch-all request handler. Export the app from `src/index.ts`; the development adapter or production runner serves it.

| Option | Default / behavior |
| --- | --- |
| `locals(c)` | Optional sync/async application locals factory |
| `plugins` | `[]`; ordered `LithonoPlugin` instances |
| `auth.publicUser(ctx)` | Null by default; sync/async public user projection |
| `auth.publicSession(ctx)` | Null by default; sync/async JSON-safe session projection |
| `head.lang` | `en` |
| `schema.toJSONSchema(schema)` | Optional converter used to derive native field constraints |
| `inline` | Uses framework configuration when omitted, otherwise `styles` fallback |

`LithonoAuthOptions` describes the two projections. `publicUser` returns `LithonoData['user']` (id/email/name or null/undefined); `publicSession` returns unknown JSON-safe data. These options do not install an authentication provider. [Optional auth integration](/docs/reference-auth) does that separately.

`InlinePolicy` is `styles | none | critical | all`. `styles` inlines whole route stylesheets, not extracted critical CSS; `critical` and `all` are compatibility aliases. `none` links CSS. Configure this in `lithono.config.ts` unless an integration needs to override it.

## Locals and request context

Plugin locals are merged in plugin order, then application locals overwrite matching keys. A fresh locals object is collected for each matched request. `RequestContext` flattens locals alongside `request`, `params`, `url`, `c`, and optional `error`. Framework context fields take precedence over locals with those names.

```ts title="src/index.ts"
import { createLithonoApp } from 'lithono/server';

declare module 'lithono' {
  interface Locals { catalogLabel: string }
}

export default createLithonoApp({
  locals: () => ({ catalogLabel: 'Chapter House' }),
});
```

`Locals` augmentation describes available fields; it does not initialize them. A plugin's `locals` returns `Partial<Locals>`, while application `locals` returns `Locals`. Factories must actually provide required values. Private locals do not automatically cross into page HTML; loader results and explicit auth projections do.

Avoid request-specific mutable module globals. Share a database pool or repository service at module scope, but derive identity/authorization from each context.

## LithonoPlugin lifecycle

`LithonoPlugin` is exported as a type from `lithono` and `lithono/server`:

```ts
import type { LithonoPlugin } from 'lithono/server';

export const healthPlugin: LithonoPlugin = {
  name: 'health',
  ready() { /* initialize a shared service, if needed */ },
  configure(app) {
    app.get('/health', c => c.json({ ok: true }));
  },
};
```

For each plugin in sequence, startup awaits `ready()` and then `configure(innerApp)`. After all plugins, it discovers pages and registers framework routes. `configure` receives the **inner** Hono application, so plugin endpoints/middleware are registered before page handlers. A plugin endpoint that handles a request does not automatically run the page locals pipeline; obtain request services explicitly if it needs them.

`locals(c)` runs later for page/resource/action requests. There is no plugin teardown hook in this interface. Startup failures prevent the ready route pipeline; inspect server logs/cause rather than expecting a page error template to fix initialization.

## Schema integration

`deriveFields(schema: StandardSchemaV1 | undefined): Record<string, FieldConstraints>` extracts top-level object-field constraints through the configured JSON Schema converter. The default converter uses Zod. Missing schemas and conversion failures return `{}`; server Standard Schema validation remains independent.

`SchemaOptions` contains only `toJSONSchema?: (schema: unknown) => unknown`. Supply it when your schema library needs a custom conversion. Derived HTML bounds are hints, not a complete representation of refinements, exclusive numeric bounds, or complex unions. Always validate on the server.

## Advanced exported utilities

These exports describe generated graph/asset integration. Their parameter types are available through inference even when they have no separately exported named type at this entry point.

| Utility | Signature / result |
| --- | --- |
| `fileToRoute(rel)` | Route-relative role path to `{ pattern, honoPath, kind, paramNames }` |
| `discoverRoutes(modules)` | Record of compiled graph modules to ordered resolved routes |
| `tagFromModuleId(id)` | Derives an element tag from a normalized module path |
| `buildElementRegistry(modules)` | Loader record to a `Map` of tag/module registration records |
| `streamPageResponse(c, options)` | Hono HTML response writer for already-rendered chunks and resolved assets |

`discoverRoutes` expects compiled HTML elements plus server exports, not raw source text. Missing layout templates/tags and `prerender: true` throw. Registry loaders can carry `tag` and `clientOnly` metadata; later entries can replace colliding entries subject to client-only precedence. Prefer normal Vite discovery instead of depending on collision behavior.

`streamPageResponse` requires `meta`, `chunks: string[]`, `data: LithonoData`, and resolved `assets` (`bootstrap: string`, `scripts`, `stylesheets`, and `modulePreloads` string arrays, plus optional `linkedStylesheets`). Optional writer fields are `lang = 'en'`, `inline = 'styles'`, `importScript`, and `envelope` (the application document). It writes buffered SSR output. It does not start loaders, progressively resolve templates, discover dependencies, or sanitize arbitrary HTML chunks.

## Errors and deployment

A thrown `Response` is returned directly. Expected `HttpError` responses expose the message only when its `expose` flag permits it. Unhandled failures log on the server and fall back to a generic 500 when no error template applies. Matched route failures can use the special templates described in [route contracts](/docs/reference-routes).

The production runner must serve built client assets alongside this Hono application. Use the generated runner and [deployment guide](/docs/deployment); calling `createLithonoApp()` alone does not configure a reverse proxy, a persistent database, or production asset hosting.
