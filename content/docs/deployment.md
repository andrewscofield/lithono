---
title: Build and deploy to Node
description: Ship the emitted client and server trees with runtime dependencies and durable application data.
section: Guides
---

The supported alpha deployment target is buffered SSR on Node.js. A successful local dev server is not the same as an independently deployable production artifact.

## Build the application

```shell
pnpm typecheck
pnpm check
pnpm build
pnpm serve
```

The starter's serve command runs `dist/server/src/server.js` with `NODE_ENV=production`. Use Node 22.13 or later and the dependency versions your application lockfile records.

## Include both output trees

```text
dist/
  client/       Browser modules, processed CSS, public assets, manifest
  server/       Node server and SSR modules
  inspect/      Compiler inspection output
```

Deploy the client and server trees together, plus the package manifest, lockfile, and required runtime dependencies. Preserve emitted paths. The production document and stylesheet data are resolved during the build rather than requiring the original source checkout.

Application-specific data still needs a durable location. The showcase uses `LITHONO_DEMO_DATABASE`; the independent tutorial uses `CHAPTER_HOUSE_DATABASE`. Point the relevant variable at a writable persistent SQLite path. These are application options, not framework-wide configuration. An ephemeral deployment directory is not durable business storage.

## Configure the server

```ts title="lithono.config.ts"
import { defineConfig, node } from 'lithono/config';

export default defineConfig({
  adapter: node(),
  inline: 'styles',
});
```

`styles` inlines whole route stylesheets once. `none` emits stylesheet links. The compatibility values `critical` and `all` do not implement critical-CSS extraction.

Cloudflare adapter requests and prerender requests currently fail explicitly because those capabilities are not implemented. Plan deployment around the supported target rather than copying another framework's adapter recipe.

## Keep secrets and integrations server-side

Supply credentials through the runtime environment and keep provider clients behind server boundaries. Framework installation does not require the showcase's Stripe, Resend, or map configuration.

For a provider-backed workflow, record a durable domain result separately from delivery status. “Email accepted by provider” is not proof that a message arrived in an inbox.

## Verify the actual artifact

Before release, copy only the deployment files to a clean location, install runtime dependencies, and run the Node server. Check an initial response, static assets, dynamic routes, enhanced navigation, forms, and JavaScript-disabled behavior.

The docs content pipeline embeds compiled articles in the server build. A deployed documentation site should not need its authoring Markdown directory at runtime.

See [the tutorial's production rehearsal](/docs/tutorial-production) for exact environment, copy, and restart commands verified against a source-free artifact; [configuration](/docs/reference-config) for options; and [migration](/docs/migration) for upgrade checks.
