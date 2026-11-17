# Lithono

**A Lit-first, server-first application framework for web components.** Native navigation and forms, explicit server data, light-DOM-first composition, opt-in URL-backed view state, and readable modern JavaScript/CSS.

The repository now prepares **`0.1.0-alpha.1`**. This is a locally verified alpha, not a published npm release. Node buffered SSR is the supported deployment target.

## Work on the framework

```sh
pnpm install
pnpm build:packages
pnpm dev
```

The root is a private example application. Core authoring remains under `src/framework/`; `packages/lithono` builds its compiled JavaScript, declarations, CLI, and assets. `packages/create-lithono` contains the distributable starter generator. Both are pnpm workspace packages. Authentication and animation belong to the example or optional framework entry points, not every consumer's required stack.

## Explore the showcase

The root application now includes seven distinct experiences alongside the simple lists/tasks baseline:

| Route | Demonstrates |
| --- | --- |
| `/listings` | URL search/filter/sort, selectively loaded MapLibre, durable inquiries |
| `/components` | Curated capabilities, ordinary/mapped component imports, lazy previews |
| `/dashboard` | Workspace-owned projects, mixed components, drafts preserved across refreshes |
| `/workshops` | Native booking, atomic capacity holds, Stripe test Checkout, confirmation email |
| `/inventory` | Keyed row editors, version conflicts, isolated workspaces, adjustment audits |
| `/community` | Server-owned reading, shared client navigation, bookmarks/RSVP, newsletter lifecycle, editorial roles |
| `/bookstore` | Chapter House catalog, transactional receiving, draft/publication, connected personal storefronts |
| `/docs`, `/lab` | Public API documentation, curated source/generated output, ownership experiments |

Sign in for personal workflows. Configure hosted tiles, Resend and Stripe test mode
as described in [showcase setup](reference/engineering/showcase-setup.md); missing configuration is
reported explicitly. Live-provider smoke checks remain separate from the local
test substitutes. Existing lists remain the basic shared demo.

## Use the alpha in another application

```sh
pnpm build:packages
mkdir -p artifacts
pnpm --filter lithono pack --pack-destination "$PWD/artifacts"
pnpm --filter create-lithono pack --pack-destination "$PWD/artifacts"
```

Follow [installation](content/docs/installation.md) to generate a sibling application and install the packages from `artifacts/`. `pnpm test:package` exercises the packaged starter in an independent test application, including strict declarations through real package exports, application `@/` imports, CLI generation, development/production SSR, and Chromium hydration.

After publication, the intended command is `pnpm create lithono my-app`; it is not yet a promise that the alpha is available in the registry.

## Application model

- Route files export `loader`, `actions`, and `meta` using ordinary modules.
- Adjacent HTML/CSS provide the trio authoring convenience; ordinary Lit and vanilla JavaScript components are also supported.
- Forms use native action URLs. Enhancement preserves submitter overrides, validation, repeated fields, files, and accessible errors.
- URL query contracts are shared by loaders and subscribing components. Native GET forms and links remain the baseline.
- Light-DOM owners hydrate existing markup and perform incremental updates; layouts retain stable page outlets.
- External components have explicit registration imports and SSR/client-only modes.
- Forms, server actions, URL query contracts, and Lit components can expose structured browser tools through `lithono/webmcp` and the W3C WebMCP (`navigator.modelContext`) API.
- Compiler output, source maps, and hydration decisions are inspectable under `dist/inspect`.

## Verify

```sh
pnpm exec playwright install chromium
pnpm test:types
pnpm lint
pnpm check
pnpm test:node
pnpm test:showcase
pnpm build
pnpm test:browser
pnpm test:demos:production
pnpm test:package
```

CI runs the same gates on Node 22.13 and Node 24. Local results and the exact tested environment are recorded in [the alpha release record](reference/engineering/RELEASE_ALPHA.md).

## Build and deployment

```sh
pnpm build
pnpm serve
```

Deploy both output trees (`dist/client` and `dist/server`) with the application's runtime dependencies. The document, manifest, and processed CSS are resolved at build time; production does not require the source checkout. `hydrate = false` disables page hydration; reading pages still participate in shared client navigation.

JavaScript and CSS are not minified. The `styles` CSS policy inlines whole-route sheets once; `none` emits stylesheet links. `critical` and `all` are compatibility aliases, not critical-CSS extraction. Lit-readable dependencies retain development diagnostics. Cloudflare and prerender requests fail explicitly because those capabilities are not implemented.

## Documentation

- Open `/docs` in the running application for the searchable documentation site.
- [Documentation introduction](content/docs/introduction.md)
- [Installation](content/docs/installation.md)
- [Chapter House application](content/docs/bookstore.md)
- [WebMCP and AI agent tools](content/docs/webmcp.md)
- [Documentation authoring](reference/documentation-authoring.md)
- [Documentation and bookstore implementation verification](reference/documentation-build-verification.md)
- [Showcase setup and real integration configuration](reference/engineering/showcase-setup.md)
- [Migration guide for existing applications](reference/engineering/MIGRATION_ALPHA.md)
- [Alpha scope and verification](reference/engineering/RELEASE_ALPHA.md)
- [URL state](reference/engineering/url-state.md)
- [DOM ownership and render-state contract](reference/engineering/phase2-dom-state.md)
- [Component interoperability](reference/engineering/phase4-components-migration.md)
- [Production deployment and measured results](reference/engineering/phase5-production.md)
- [Real lists/listings demo migration verification](reference/engineering/demo-app-verification.md)

Web Awesome coverage currently establishes browser-only `wa-button` 3.0.0 registration and interaction. Compatibility is tested per component rather than assumed for every library. Browser gates currently run Chromium; Firefox and WebKit certification remain future work.
