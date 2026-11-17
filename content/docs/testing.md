---
title: Testing a Lithono application
description: Verify domain rules, native and enhanced forms, authorization, ownership, and production output with the smallest useful test boundary.
section: Guides
---

Test what a failure would cost the user. A stock receipt needs transactional and replay checks; a static explanatory paragraph does not need a component-unit harness. Lithono applications can use ordinary TypeScript tests and browser tests without learning a separate component testing language.

## Start with the generated application checks

From your generated application's directory:

```shell
pnpm typecheck
pnpm check
pnpm build
```

`typecheck` checks TypeScript modules. `check` parses templates and checks component conventions. `build` exercises the actual server/client split and emits inspectable output. None of these promises full semantic TypeScript checking of every HTML binding; exercise important bindings through rendered output.

The commands below that reference `tests/` are for the **Lithono repository checkout**. A generated app supplies its own tests, dependencies, fixtures, and script names.

## Test durable rules without a browser

Keep persistence/domain rules in a server repository that accepts an explicit database/service dependency. Use an isolated database, deterministic inputs, and `finally` cleanup. A test should prove an invariant rather than assert the exact implementation sequence.

Chapter House's executable tests cover ownership, publication, identical replay, changed replay input, stale versions, and rollback after a ledger failure:

```ts source="tests/showcase-node/bookstore.test.ts"
```

Run the focused test from this checkout:

```shell
pnpm exec tsx --test tests/showcase-node/bookstore.test.ts
```

`pnpm test:showcase` also typechecks that suite and runs the broader repository tests. Use a database file per browser run/account fixture when testing request behavior; do not point tests at your everyday `.data` database.

## Exercise the request boundary

Calling an action's `run()` directly bypasses request parsing, schema validation, method/origin checks, cookie handling, and response negotiation. Use an actual request to a running app for those concerns.

Useful assertions include:

- Invalid input returns field issues and performs no write.
- Anonymous JSON actions fail with 401; HTML navigation reaches login.
- A second account cannot read or mutate the first account's product.
- An expected 409 preserves enough input to recover.
- A successful write followed by refresh failure is not reported as an uncommitted mutation.

Send the same-origin `Origin` header when constructing mutation requests manually. Inspect status, content type, redirects, and body—not only whether `fetch()` resolved. Application result data and the framework action envelope are distinct; browser clients unwrap the latter.

## Run native and enhanced browser flows

Use Playwright or another real browser runner. Create a fresh context with `javaScriptEnabled: false` for the native path and a separate enabled context for enhancement. Find controls by label/role and wait for visible results rather than sleeping for an arbitrary interval.

For Chapter House, both paths register, create a draft, receive stock, and publish. The enabled path also checks that receiving does not erase an unfinished edit in another form. Replay and stale-version requests verify that the UI and durable rules agree.

From this checkout:

```shell
pnpm test:demos tests/demo-apps/bookstore.spec.ts tests/demo-apps/documentation.spec.ts
```

The actual-app test config owns port 4197, starts the server, uses a fresh SQLite file, and configures local provider fixtures. Do not run a second suite on that port simultaneously. Test credentials/data belong to those fixtures.

For interactive components, check state after reconnect/navigation, focus and selection, keyed row identity, pending edits, and resource cleanup. For motion, emulate reduced motion and verify content without JavaScript. For browser-only widgets, assert server fallback and absence of server import errors.

## Check the production artifact

Development module loading and production manifests are different paths. After building, run the same important browser checks against production:

```shell
pnpm build
pnpm test:demos:production tests/demo-apps/bookstore.spec.ts tests/demo-apps/documentation.spec.ts
```

Run this after the development suite has stopped; both configs use port 4197. A deployment check should also copy the built artifact to a location without application source/authoring files. This catches accidental runtime filesystem reads.

Framework contributors can use `pnpm test:package` to check real packed exports, strict declarations, generated starter SSR, and browser interaction. It rebuilds workspace package output; schedule it sequentially with app checks that import the installed workspace package.

## Documentation and tutorial verification

`pnpm test:docs` verifies article metadata, links/anchors, source-backed fences, escaped highlighting, and development content watching. It does not typecheck arbitrary code fences or independently build external-framework comparison snippets.

The [tutorial checkpoints](/docs/tutorial-checkpoints) provide a small catalog and validated preview, [five connected bookstore stages](/docs/tutorial-bookstore), and [an executable lifecycle app](/docs/executable-examples). Their verification command builds and exercises all eight applications independently. `pnpm test:docs:completion` adds app/browser and complete published-site checks in a single sequential gate. Use a small checkpoint to reproduce a failure before adding unrelated integrations. [Debugging](/docs/debugging) explains how to identify which layer failed.
