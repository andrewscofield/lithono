---
title: Build Chapter House from a starter
description: Follow a complete database-to-deployment bookstore tutorial with independently generated, tested checkpoints.
section: Guides
---

Build a small application with a public book catalog and a private account-owned backoffice. You will load data, sign in, edit drafts, receive stock, publish books, test the rules, and run the production artifact. Basic TypeScript, HTML, and CSS are enough; the core tutorial does not require authoring a Lit component.

## Prepare the packages once

Use the checkout-local distribution in [installation](/docs/installation). From the Lithono checkout:

```shell
pnpm install
pnpm build:packages
mkdir -p artifacts
pnpm --filter lithono pack --pack-destination "$PWD/artifacts"
pnpm --filter create-lithono pack --pack-destination "$PWD/artifacts"
```

The checkpoint generator below uses these tarballs. It invokes the packed starter generator, copies the tutorial's application files, installs declared dependencies, and records the layers in the generated `CHECKPOINT.md`. Framework imports resolve the real package; only application `@/` imports map to `src/`.

## Choose a checkpoint

Every command in this table runs **from the Lithono checkout**, with a new sibling destination. Each checkpoint is a complete generated app. You can start with any row without running the earlier apps.

| Chapter | Checkpoint name | What works |
| --- | --- | --- |
| [Database catalog](/docs/tutorial-database) | `bookstore-catalog` | Persistent SQLite data and public published-only reads |
| [Accounts](/docs/tutorial-accounts) | `bookstore-account` | Registration/login/logout and a private catalog per account |
| [Draft editing](/docs/tutorial-editing) | `bookstore-editing` | Validated creation, edits, and optimistic conflict checks |
| [Receiving](/docs/tutorial-receiving) | `bookstore-receiving` | Atomic stock/receipt writes and safe replay |
| [Publication](/docs/tutorial-publishing) | `bookstore-publishing` | Published public shops and product pages |
| [Production](/docs/tutorial-production) | Uses `bookstore-publishing` | Tested build, persistent storage, and copied deployment |

For example:

```shell
node tools/docs-project.mjs bookstore-catalog ../chapter-house-catalog
pnpm --dir ../chapter-house-catalog dev
```

Open the generated directory in your editor. To start a later chapter, generate its named checkpoint in another new directory. Earlier app databases remain in their original folders. A fresh later checkpoint has fresh data; repeat registration/creation as its chapter directs.

## Understand the source layers

`examples/docs/bookstore/catalog/` contains the base application overlay. Later `account`, `editing`, `receiving`, and `publishing` directories contain additions and complete replacement files. `examples/docs/projects.json` lists the exact ordered layers and runtime dependencies for each checkpoint.

The generator assembles these layers onto the standard starter; overlay directories alone are not standalone packages. Inspect the resulting application to see all files together. Commands always name an unused destination rather than overwriting your application.

Source-backed fences in these chapters show **complete files** and name the destination file in the generated app. The repository source path identifies the layer from which that file comes. Explanatory expressions without a filename are excerpts. When two chapters show the same destination, the later complete file replaces the earlier one in that later checkpoint.

## Keep the data flow simple

The core cycle is:

1. A server loader reads an owner-scoped repository.
2. `page.html` reads the loader result through `data.*`.
3. A native form submits to a named server action.
4. The action validates input, derives identity from the request, and performs the write.
5. Native navigation or enhanced loader refresh shows the durable result.

A loader is an ordinary server function. A repository is your application module for database queries. An action is a named server operation. “Hydration” means connecting browser behavior to the already-rendered HTML; no client-side schema/database copy is required for the tutorial's forms.

## Check your work at each stage

From any generated bookstore app:

```shell
pnpm typecheck
pnpm check
pnpm test
pnpm build
```

The generator supplies `tsx` and the domain test script. TypeScript checks modules; Lithono checks template syntax/conventions; tests check application invariants; the build checks real client/server boundaries. Important HTML bindings are also exercised by the repository's browser gate, since template expressions do not yet receive full semantic TypeScript checking.

From the Lithono checkout, `pnpm test:docs:checkpoints` generates and verifies all checkpoints, including the [executable lifecycle examples](/docs/executable-examples). Start with [the database catalog](/docs/tutorial-database).
