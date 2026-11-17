---
title: Tutorial 6 — test and deploy the result
description: Run the complete bookstore checks, configure stable identity and storage, and serve a copied Node production artifact.
section: Guides
---

The finished application is the `bookstore-publishing` checkpoint. Deployment needs the built server/client files, compatible runtime dependencies, stable auth configuration, and a persistent database path. Vite's development server is not the production server.

## Build the final checkpoint

From the Lithono checkout, generate a new app if you have not already reached the last chapter:

```shell
node tools/docs-project.mjs bookstore-publishing ../chapter-house-publishing
```

From the generated app, use the [account environment setup](/docs/tutorial-accounts#generate-and-configure), then run:

```shell
pnpm typecheck
pnpm check
pnpm test
pnpm build
```

The four domain tests cover seed/owner/visibility rules, draft conflicts, receiving rollback/replay, and publication independent of stock. The packed-checkpoint gate adds actual HTTP and browser behavior; calling `run()` directly would miss request validation, cookies, and response negotiation.

## Run Node production

For a local production rehearsal, keep the same working directory and secret/database. Match the canonical auth URL to the new port:

```shell
export BETTER_AUTH_URL=http://localhost:3000
export PORT=3000
pnpm serve
```

Open `http://localhost:3000`. Register/sign in, create/receive/publish, reload, and restart the server. The data should persist. Stop a development process before testing the same port or database concurrently.

The generated runner serves `/assets/*` from `dist/client` and mounts the Hono app. `dist/server/src/server.js` is the Node entry point. Set the process working directory to the deployed app so relative asset paths resolve.

## Copy a self-contained application artifact

For a local copy rehearsal, stop the server and choose a new sibling directory. From the generated app:

```shell
mkdir ../chapter-house-deploy
cp -R dist node_modules package.json pnpm-lock.yaml ../chapter-house-deploy/
```

Open a terminal in `chapter-house-deploy` and export the same stable `BETTER_AUTH_SECRET`, the matching `BETTER_AUTH_URL`/`PORT`, and an **absolute** `CHAPTER_HOUSE_DATABASE` path pointing to the original database or a prepared persistent volume. Run:

```shell
NODE_ENV=production node dist/server/src/server.js
```

This directory has no application `src/`, authoring content, or Vite config. The checkpoint gate performs this copy/restart, verifies the published title/`$23.99`/7-copy stock survive, then signs into the existing account and loads its private editor. Its copied dependency tree comes from an independent installed consumer, so it has no workspace source dependency.

For a remote deployment, install/copy the dependency tree for the target platform and preserve its pnpm symlinks/store layout. Build artifacts are not a replacement for installed runtime dependencies. Run Node behind your chosen HTTPS proxy/process manager with environment supplied by the deployment.

## Treat storage and auth as deployment inputs

Keep SQLite outside replaceable build output and ensure the process can write its parent directory. Back up the database consistently and test restoring it. A new empty path creates a fresh catalog/auth database; it does not recover records from the old path.

Use the real public origin for Better Auth's base URL/trusted origin and a stable deployment secret. The tutorial opts into startup migrations; plan how that initialization runs when deploying multiple processes. Its small idempotent application schema is a teaching starting point; evolve deployed schema with deliberate versioned migrations as the application grows.

## Run the documentation completion gate

From the Lithono checkout:

```shell
pnpm test:docs:completion
```

It compiles documentation, generates all eight independent examples from packed packages, runs their type/template/domain/browser checks, verifies copied deployment, runs app checks/build plus targeted development/production browser suites, and checks every published HTML/Markdown endpoint and `/llms.txt` entry. Package-mutating checks run sequentially before app checks.

CI runs the corresponding checks on its Node matrix; a local pass establishes only the runtime used locally. The [executable lifecycle examples](/docs/executable-examples) cover advanced client behavior separately from this HTML-first tutorial, and [testing](/docs/testing) explains how to grow your application's own suite.
