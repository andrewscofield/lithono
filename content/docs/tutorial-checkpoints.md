---
title: Reproducible tutorial checkpoints
description: Build two independent starter applications to verify loader rendering and validated native/enhanced actions before adding persistence and authentication.
section: Guides
---

These checkpoints are small source overlays for fresh generated starters. Each works independently: the catalog needs no database or auth, and the delivery preview needs no catalog setup. They use public package imports, `@/` source imports, and explicit loader `data.*` bindings.

For a complete persistent workflow, follow [the connected bookstore tutorial](/docs/tutorial-bookstore), with five additional independently generated stages. [Executable lifecycle examples](/docs/executable-examples) cover advanced browser APIs. This page keeps the original two introductory overlays small and self-contained.

## Prepare a local distribution

Follow [installation](/docs/installation#build-the-distribution) to build and pack both packages into the checkout's `artifacts/` directory. Run the following generation/copy commands **from the Lithono checkout**, using unused sibling destinations. Start each app from its own directory after generation.

These are intentionally starter overlays, not standalone package manifests. The generator supplies the Vite config, TypeScript config, Hono app/Node runner, scripts, and pinned Lit version. Copying just the overlay into an empty directory would omit those pieces.

## Checkpoint 1: a server-rendered catalog

```shell
pnpm dlx ./artifacts/create-lithono-0.1.0-alpha.1.tgz ../catalog-checkpoint
cp -R examples/docs/01-catalog/src/. ../catalog-checkpoint/src/
pnpm --dir ../catalog-checkpoint add "$PWD/artifacts/lithono-0.1.0-alpha.1.tgz"
pnpm --dir ../catalog-checkpoint typecheck
pnpm --dir ../catalog-checkpoint check
pnpm --dir ../catalog-checkpoint build
pnpm --dir ../catalog-checkpoint dev
```

The overlay replaces the starter root page and adds a shared catalog module. Unused starter component files can remain. Open the URL printed by Vite. Expect “Field Notes”, `$18.00`, “Night Trains”, and `$24.50`. With JavaScript disabled, both records and their stock counts still appear.

```ts source="examples/docs/01-catalog/src/pages/page.ts"
```

```html source="examples/docs/01-catalog/src/pages/page.html"
```

The source prices are integer USD cents; `usd()` formats only for presentation. The array is read-only demonstration data, not an account-owned database. A loader-only page needs no event handlers or page hydration for this output.

## Checkpoint 2: a validated delivery preview

Create a second fresh starter; this checkpoint does not build on the first folder:

```shell
pnpm dlx ./artifacts/create-lithono-0.1.0-alpha.1.tgz ../delivery-checkpoint
cp -R examples/docs/02-delivery-preview/src/. ../delivery-checkpoint/src/
pnpm --dir ../delivery-checkpoint add "$PWD/artifacts/lithono-0.1.0-alpha.1.tgz" 'zod@^4.5.0'
pnpm --dir ../delivery-checkpoint typecheck
pnpm --dir ../delivery-checkpoint check
pnpm --dir ../delivery-checkpoint build
pnpm --dir ../delivery-checkpoint dev
```

Stop the first dev server before starting the second if you want the same default port. Enter `5` and submit. Expect a redirect to `/?quantity=5` and “Preview: 5 copies. No stock changed.” Reloading retains the preview because it is encoded in the URL. This is explicitly a calculation/validation exercise, not a durable inventory mutation.

```ts source="examples/docs/02-delivery-preview/src/pages/page.ts"
```

```html source="examples/docs/02-delivery-preview/src/pages/page.html"
```

The schema in `src/lib/delivery.ts` coerces the form quantity to an integer from 1 to 10000. The server validates before running the action. Native and enhanced submission both redirect to a loader-backed result; no browser event handler is needed to display success.

## Reproduce validation and production behavior

Try empty, negative, fractional, and over-limit quantities. Native constraints can block a request before the action runs. To exercise **server** validation, bypass browser constraints in a test and send the same request directly; expect a validation failure rather than a redirect.

From each generated app, `pnpm build` followed by `pnpm serve` runs the production artifact. Repeat the browser steps with JavaScript enabled and disabled. Compare initial HTML, visible output, and redirect URL rather than requiring the enhanced client to use exactly the same wire response as native navigation.

## Run the repository verification

From the Lithono checkout:

```shell
pnpm test:docs:checkpoints
```

This packs the framework and generator and verifies all eight projects in `examples/docs/projects.json`: these two introductory apps, five connected bookstore stages, and the lifecycle example. Each gets an isolated generated starter, declared dependencies, real declaration checks, template checks, and a build. The gate then serves Node output and checks HTTP/native/enhanced behavior, domain rules where present, and the final copied deployment. Temporary fixtures are isolated from your own generated applications. Pass a checkpoint name to run only that project.

Run this package-building gate sequentially with other checks that load workspace package output. Arbitrary snippets elsewhere in the docs, particularly external-framework comparisons, are not covered by this checkpoint command.

Next, add [account ownership](/docs/authentication) and [durable receiving](/docs/receiving-stock). Use repository transactions, version checks, and replay tokens before presenting a preview as a saved receipt.
