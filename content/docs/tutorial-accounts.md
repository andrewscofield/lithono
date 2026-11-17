---
title: Tutorial 2 — accounts and private catalogs
description: Configure Better Auth, register and sign in with native forms, and derive catalog ownership from each request.
section: Guides
---

The public sample catalog remains useful for anonymous visitors. This stage adds an independent private catalog for each account. The browser submits identity credentials; the server establishes the session and chooses the catalog owner.

## Generate and configure

From the Lithono checkout, after [preparing packages](/docs/tutorial-bookstore#prepare-the-packages-once):

```shell
node tools/docs-project.mjs bookstore-account ../chapter-house-account
```

In a terminal whose working directory is the generated app, export the configuration and start it:

```shell
export BETTER_AUTH_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
export BETTER_AUTH_URL=http://localhost:5173
export CHAPTER_HOUSE_DATABASE=.data/chapter-house.sqlite
pnpm dev --host localhost --port 5173 --strictPort
```

Use that exact hostname/port in the browser. Keep this terminal's secret for subsequent runs against the same sessions; deployment needs a stable secret from your environment configuration. `.env.example` lists the variables but is not automatically loaded by the production Node runner. Exporting variables explicitly works for both development and production.

The generator installs Better Auth and Zod. With the currently supported Better Auth declarations, it also adds the **development-only** `bun-types` package and `bun-types/sqlite` to the tsconfig `types` list. The provider's database type union imports `bun:sqlite` even in a Node consumer. Loading just that declaration avoids importing Bun's global environment/HMR types, which conflict with Vite. Runtime stays Node, and `skipLibCheck` stays false.

## Connect the provider to requests

Complete file: `src/server/auth.ts`.

```ts source="examples/docs/bookstore/account/src/server/auth.ts"
```

The provider uses the same SQLite connection but manages its own auth tables. A missing secret produces an actionable startup error. Trusted origins match the canonical app origin.

Complete file: `src/index.ts`.

```ts source="examples/docs/bookstore/account/src/index.ts"
```

The tutorial explicitly runs provider migrations at startup with `migrate: true`. Better Auth can report its initial missing-table diagnostic before that hook creates tables on a new database. Startup must complete and registration must succeed; a persistent schema error needs investigation. For a managed deployment, choose a migration step appropriate to its process lifecycle.

The public user projection exposes only id/email/name. Full server session data is not serialized, and the default public session projection remains null. UI identity and server authorization are different concerns.

## Validate credentials and return paths

Complete file: `src/lib/auth-input.ts`.

```ts source="examples/docs/bookstore/account/src/lib/auth-input.ts"
```

Zod checks the submitted object. Registration requires a name and a password of at least 12 characters. The login return path must be a local absolute path: an unvalidated `next` parameter could redirect to an unrelated website.

## Register with an HTML form

Complete files: `src/pages/register/page.ts` and `page.html`.

```ts source="examples/docs/bookstore/account/src/pages/register/page.ts"
```

```html source="examples/docs/bookstore/account/src/pages/register/page.html"
```

The helper forwards provider cookies into the response. Redirecting afterward creates a fresh request with the authenticated identity. The template preserves non-secret submitted fields after a failure and deliberately leaves the password blank.

## Sign in and sign out

Complete files: `src/pages/login/page.ts` and `page.html`.

```ts source="examples/docs/bookstore/account/src/pages/login/page.ts"
```

```html source="examples/docs/bookstore/account/src/pages/login/page.html"
```

Complete file: `src/pages/logout/page.ts`.

```ts source="examples/docs/bookstore/account/src/pages/logout/page.ts"
```

The layout contains a native POST sign-out form targeting that resource route. It intentionally performs document navigation because it targets another pathname; logout is not a GET link. The provider clears the cookie before the redirected page loads.

## Protect the catalog loader

Complete file: `src/pages/admin/page.ts`.

```ts source="examples/docs/bookstore/account/src/pages/admin/page.ts"
```

`requireUser(ctx)` redirects anonymous HTML requests to login and rejects anonymous JSON requests with 401. Its returned ID chooses the owner. A caller-supplied query parameter or hidden input never chooses the private owner.

Visit `/admin` while signed out, register, and confirm the private catalog includes the Night Trains draft. Register another account in another browser context: it receives separate records. Sign out, revisit `/admin`, and sign back in. Repeat with JavaScript disabled. Continue with [draft creation and editing](/docs/tutorial-editing).
