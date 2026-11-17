# Lithono — public alpha

Lit-first, server-first web-component applications with Hono, native forms and navigation, opt-in URL-backed view state, and readable modern output.

This is `0.1.0-alpha.1`. Supported deployment is buffered Node SSR. Prerendering and Cloudflare deployment are not implemented and are rejected explicitly.

## Start an application

```sh
pnpm create lithono my-app
cd my-app
pnpm install
pnpm dev
```

For a locally packed alpha, install the Lithono tarball into the generated application instead of resolving it from the registry. Publishing is a separate step.

The starter includes a server-rendered page and an interactive Lit counter. Server route modules export loaders, actions, and metadata; adjacent HTML/CSS files are compiled into inspectable modules.

## Entry points

| Import | Purpose |
| --- | --- |
| `lithono` | Browser-safe template helpers, action definitions, schemas, public types |
| `lithono/client` | Lit integration, context controllers, forms, URL subscriptions |
| `lithono/url` | Framework-neutral query parsing and serialization |
| `lithono/server` | Hono application and SSR |
| `lithono/config` | Build configuration and Node adapter |
| `lithono/vite` | Vite integration |
| `lithono/auth`, `lithono/auth/client` | Optional Better Auth integration |
| `lithono/animate` | Optional Anime.js integration |
| `lithono/webmcp` | W3C WebMCP adapter, declarative form helpers, and reactive tool controller |

Install Better Auth or Anime.js only when using their entry points. Lit and Vite are required peers. Lit SSR dependencies are pinned because light-DOM hydration includes a version-sensitive compatibility adapter.

## Build and deployment

```sh
pnpm typecheck
pnpm check
pnpm build
pnpm serve
```

Deploy both `dist/client` and `dist/server`, with the application's runtime dependencies. Configuration, document envelope, manifest, and processed route CSS are embedded during the build. Production requests do not require the source checkout.

The framework does not minify JavaScript or CSS. The default CSS policy is `styles` (whole-route styles inlined once); use `none` for stylesheet links. This is not critical-CSS extraction. Compatible Lit development modules are selected for readability and retain development diagnostics. Already-minified third-party packages remain limited by their supplied sources.

Native links and GET/POST forms are the baseline. URL query contracts are optional and shared by server loaders and subscribing client components. Transient interaction state stays local.

## Alpha compatibility

Deploy client and server together: the action protocol is versioned and incompatible with the earlier source-only prototype. Use `redirect()` for navigation, public identity projections under `createLithonoApp({ auth: { publicUser, publicSession } })`, and config imports from `lithono/config`. Application return keys such as `redirect`, `revalidate`, and `__lithono` are no longer transport metadata.

The optional config `elements` catalog supplies tag-to-import mappings for route-selective loading, not eager imports on every page. Ordinary registration imports in component modules and trios remain supported without mappings. Server-safe mapped registrations run at server startup; browser delivery is selected independently per route.

See the repository's `content/docs/` for public documentation and `reference/engineering/` for the migration and verification record. Third-party compatibility is tested per component, not guaranteed for every web-component library. The tested Web Awesome integration is browser-only `wa-button` 3.0.0.
