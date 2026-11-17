---
title: Configuration and package entry points
description: Reference Lithono config, external-element registration, CLI commands, and the supported public import boundaries.
section: API reference
---

Create `lithono.config.ts` and import `defineConfig` from `lithono/config`. Configuration may be an object, a promise, or a function of Vite's configuration environment returning either.

## Configuration options

| Option | Default / meaning |
| --- | --- |
| `prefix` | Optional prefix for generated component tags |
| `elements` | Optional tag-to-registration map; ordinary explicit imports also work |
| `server.entry` | Development app entry, defaults to `src/index.ts` |
| `server.serverEntry` | Production runner, defaults to `src/server.ts` |
| `server.port` | Default port 5173 |
| `adapter` | Node is the supported deployment target |
| `inline` | `styles` by default; `none` links CSS; `critical`/`all` are compatibility aliases |
| `webmcp` | Optional WebMCP default configuration object |
| `vite` | Additional Vite config or an environment function returning it |

Supported config filenames include `.ts`, `.js`, `.mjs`, and `.cjs` forms of `lithono.config`.

## External element registration

```ts title="lithono.config.ts"
import { defineConfig, node } from 'lithono/config';

export default defineConfig({
  adapter: node(),
  elements: {
    'delivery-map': {
      import: '@/components/delivery-map.client.ts',
      mode: 'client-only',
    },
  },
});
```

Each entry has an `import` package specifier, `@/` source path, or project-root-relative module and a `mode` of `ssr` or `client-only`.

`ssr` requires a server-safe registration module. `client-only` keeps useful server fallback markup and loads the definition in the browser. Registration imports are selected per route rather than eagerly importing the entire catalog everywhere.

## Public package entry points

| Import | Purpose |
| --- | --- |
| `lithono` | Route/action contracts, HTTP helpers, schema types, selected template helpers |
| `lithono/client` | Component classes, controllers, contexts, forms, URL state, navigation |
| `lithono/client/bootstrap` | Framework browser startup integration |
| `lithono/server` | Hono application creation and server integration |
| `lithono/config` | Configuration and adapter selection |
| `lithono/url` | Shared browser-safe query contracts and codecs |
| `lithono/vite` | Vite integration |
| `lithono/auth` | Optional server authentication integration |
| `lithono/auth/client` | Optional client authentication integration |
| `lithono/animate` | Optional animation integration |
| `lithono/webmcp` | W3C WebMCP (`navigator.modelContext`) adapter, form helpers, and controller |

Use installed public imports in application examples, not paths into this repository's `src/framework`. The packed-consumer gate checks declarations without redirecting package imports to framework source; the application's `@/*` mapping is separate.

## Client building blocks

Use the dedicated contracts for [component/page/layout classes](/docs/reference-elements), [route modules](/docs/reference-routes), [controllers](/docs/reference-controllers), [context/decorators](/docs/reference-context), [form lifecycle](/docs/reference-forms), and [navigation/snapshots](/docs/reference-navigation).

[Server integration](/docs/reference-server), [authentication](/docs/reference-auth), and [animation](/docs/reference-animation) document runtime availability and optional peers. Prefer the introductory patterns before coupling application code to advanced transport or generated-graph helpers.

## Vite integration

`lithonoViteConfig(inlineOverrides?)` from `lithono/vite` returns an async Vite config function. Overrides can be a `UserConfig` or an environment function returning one. It loads the project config from the current working directory, assembles development serving plus client/SSR builds, merges `config.vite`, applies the adapter, then merges inline overrides.

```ts title="vite.config.ts"
import { lithonoViteConfig } from 'lithono/vite';

export default lithonoViteConfig();
```

The standard config emits `dist/client`, `dist/server`, and `dist/inspect`, preserves readable output, and enables source maps. It currently forces JavaScript/CSS minification off even after config merges. It also supplies hydration/browser dependency integration and development request serving.

`lithono(options?: LithonoConfig): Plugin` is the lower-level pre-plugin for an existing Vite setup. When options are omitted it loads project config. It compiles trios/templates, supplies virtual route/element modules, checks client/server import boundaries, writes editor/inspection metadata, and provides `@/` resolution rooted at the application's `src/`. An explicitly configured matching alias takes precedence. The plugin alone does not assemble the complete development server and production runner build; use `lithonoViteConfig` for the standard app.

## Config helpers and types

`defineConfig(config: LithonoConfigExport): LithonoConfigExport` is a typing helper that returns its argument. `LithonoConfigExport` accepts `LithonoConfig`, a promise, or `LithonoConfigFn` (`ConfigEnv` to config/promise). Related types are `LithonoServerConfig`, `ExternalElementConfig`, and `LithonoAdapter`.

`node(): LithonoAdapter` selects the supported adapter. `cloudflare()` is an exported experimental placeholder; selecting it is rejected as unsupported. `LithonoAdapter` has `name`, optional `vitePlugins`, `ssrResolve`, and `apply(config)`; this structural interface is not a guarantee that arbitrary non-Node adapters are supported.

Advanced config tooling can use `CONFIG_CANDIDATES`, `resolveConfigFilePath(root = process.cwd()): string | undefined`, and `loadLithonoConfig(root = process.cwd(), env = { command: 'serve', mode: 'development' }): Promise<LithonoConfig>`. Missing configuration returns `{}`. Loading failures throw a contextual error with the original cause. These use Node filesystem/Vite configuration loading and must stay outside browser code.

## CLI commands

```shell
pnpm exec lithono check
pnpm exec lithono generate stock-counter
```

`check` parses templates and checks component conventions. `generate` creates a TypeScript/HTML/CSS trio and updates editor metadata. A configured prefix affects the generated tag.

Run generation for a new component name; inspect existing files before regenerating over an existing component.

## Template HTML insertion

`unsafeHTML` is available in template expressions for deliberately trusted, pre-rendered content. It bypasses text escaping. This documentation uses it for repository-authored Markdown compiled with raw author HTML disabled.

Never pass arbitrary customer text or an untrusted CMS response directly into it. Ordinary `${value}` bindings escape text and are the correct default.
