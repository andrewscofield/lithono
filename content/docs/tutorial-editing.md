---
title: Tutorial 3 — create and edit drafts
description: Add validated product actions, recover native form input, and detect stale writes with optimistic versions.
section: Guides
---

A loader shows current data; an action changes it. This chapter creates draft books and edits their catalog fields. A version number makes competing edits visible rather than silently overwriting another tab's work.

## Generate and try the checkpoint

From the Lithono checkout:

```shell
node tools/docs-project.mjs bookstore-editing ../chapter-house-editing
```

Open that app and use the [account environment/start commands](/docs/tutorial-accounts#generate-and-configure). Register a fresh account, then visit `/admin`. Create **The Connected Bookshop**, author **A. Reader**, SKU **CONNECT-1**, slug **connected-bookshop**, a description of at least ten characters, and price **2399** USD cents.

You should reach `/admin/<book-id>` with zero copies on hand and version 1. The form in this stage saves drafts; publication controls arrive in [chapter 5](/docs/tutorial-publishing).

## Define the input contract

Complete file: `src/lib/product.ts`.

```ts source="examples/docs/bookstore/editing/src/lib/product.ts"
```

Form controls submit strings. `z.coerce.number()` handles numeric conversion; integer/bounds checks then enforce the application contract. A friendly field name and native input constraints help the browser, but server validation remains authoritative.

## Write within the owner boundary

Complete file: `src/server/catalog-write.ts`.

```ts source="examples/docs/bookstore/editing/src/server/catalog-write.ts"
```

The owner comes from the action's authenticated request. Duplicate SKU/slug checks are owner-scoped. A save matches owner, record ID, and submitted version, increments the version, and reports a conflict if no row matched. Initial stock is zero for a new draft; editing catalog text is not an inventory receipt.

`CatalogConflict` represents an expected domain outcome. The HTTP boundary translates it to a recoverable 409:

Complete file: `src/server/operation.ts`.

```ts source="examples/docs/bookstore/editing/src/server/operation.ts"
```

## Create a draft through the page action

Complete file: `src/pages/admin/page.ts`.

```ts source="examples/docs/bookstore/editing/src/pages/admin/page.ts"
```

Both the loader and create action resolve identity independently. Layout loaders run concurrently and cannot authorize another operation. A direct action request still takes the same owner-scoped path.

Complete file: `src/pages/admin/page.html`.

```html source="examples/docs/bookstore/editing/src/pages/admin/page.html"
```

`actions.create.url` is the endpoint. On a native validation failure, `actions.create.values` contains submitted values and `error` contains the message. Nullish fallbacks preserve intentionally empty input rather than silently restoring an older value.

## Edit and preserve the submitted version

Complete files: `src/pages/admin/[id]/page.ts` and `page.html`.

```ts source="examples/docs/bookstore/editing/src/pages/admin/[id]/page.ts"
```

```html source="examples/docs/bookstore/editing/src/pages/admin/[id]/page.html"
```

The hidden version is not permission to write; it is a precondition checked with server-derived ownership. On a failed native save, preserve the submitted version too. Substituting the latest version automatically would silently approve overwriting someone else's edit.

Textarea labels use explicit `for`/`id` associations so the initial text is not part of the accessible label. The browser can find the field as “Description” before and after a reload.

## Exercise recovery

Open the same book in two tabs. Save a new description in one, then save the older form in the other. Expect a conflict and preserved submitted text. Compare the current record, reload deliberately, and reapply the intended change. Try a duplicate SKU to see a different conflict; try invalid input to see schema validation.

Native success redirects to a fresh loader result. Enhanced success refreshes loader data; a local pending message is not proof of a saved record. Reload to confirm durability. Run `pnpm test` to verify duplicate, cross-owner, and stale-version rejection. Next, [receive a delivery](/docs/tutorial-receiving).
