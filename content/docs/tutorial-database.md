---
title: Tutorial 1 — a database-backed catalog
description: Open SQLite, seed an owner-scoped catalog once, and render published books with plain HTML.
section: Guides
---

This chapter turns the fixture from [your first page](/docs/first-page) into persistent application data. The public catalog is mostly HTML: it needs server data and ordinary links, without a custom browser component.

## Generate and run

After [packing the local distribution](/docs/tutorial-bookstore#prepare-the-packages-once), run from the Lithono checkout:

```shell
node tools/docs-project.mjs bookstore-catalog ../chapter-house-catalog
pnpm --dir ../chapter-house-catalog dev
```

Open the Vite URL. Expect **Field Notes**, `$18.00`, and **6 copies on hand**. **Night Trains** is a draft, so it is absent from this public page. Stop the server before starting another checkpoint on the same port.

## Open a database

SQLite stores data in a local file. This tutorial uses Node's `node:sqlite`, available in the supported Node range, so you do not need a separate database server or native driver installation. Node versions may label the SQLite API experimental.

Complete file: `src/server/database.ts`.

```ts source="examples/docs/bookstore/catalog/src/server/database.ts"
```

The default file is `.data/chapter-house.sqlite`, relative to the application's working directory. `CHAPTER_HOUSE_DATABASE` can select another path. The parent directory is created deliberately. Tests use `:memory:` to avoid touching the application database.

`books` holds the book's identity, owning catalog, presentation fields, integer price, stock, publication state, and version. Unique owner/SKU and owner/slug pairs allow two accounts to use the same SKU in their separate catalogs. SQL placeholders bind values rather than concatenate request input.

`transaction(database, work)` commits all the synchronous work or rolls it back on an exception. Keep its callback synchronous: awaiting external work inside this helper would commit before that asynchronous work finished.

## Read through a repository

Complete file: `src/server/catalog.ts`.

```ts source="examples/docs/bookstore/catalog/src/server/catalog.ts"
```

`seed(owner)` creates opening data once per owner. The seed marker and books are written in one transaction, so a failed seed does not leave a marker for missing books. Reloading is safe. Opening stock is an initial balance, not a delivery receipt.

Every read takes an owner. `list(owner, true)` and `published(owner, slug)` enforce public visibility in the query/repository contract. A draft is excluded before the template receives the result. The fixed `chapter-house` owner is a sample catalog; later private catalogs use the authenticated user's ID.

Complete file: `src/server/services.ts`.

```ts source="examples/docs/bookstore/catalog/src/server/services.ts"
```

This module shares one connection/repository for the application process. Request identity will still be resolved separately on every protected operation.

## Project data for the template

Complete file: `src/lib/money.ts`.

```ts source="examples/docs/bookstore/catalog/src/lib/money.ts"
```

Complete file: `src/pages/page.ts`.

```ts source="examples/docs/bookstore/catalog/src/pages/page.ts"
```

Prices remain integer USD cents in storage: `1800` is `$18.00`. `usd()` formats at the presentation boundary. The loader returns plain data; it does not return a database handle or a live SQL statement.

## Render without a component class

Complete file: `src/pages/page.html`.

```html source="examples/docs/bookstore/catalog/src/pages/page.html"
```

`data.books` is the loader's array. JavaScript's `map()` returns one template per book; `html` is a tagged-template helper that tells Lit which parts are markup and which are values. The loop variable `book` is local, while loader access starts with `data`. Ordinary value bindings escape text.

The starter integration supplies compilation/registration. The overlay also adds `layout.html` for a shared header/main outlet and `layout.css` for a small normal CSS layout. Adjacent CSS participates in the standard cascade.

## Verify persistence and visibility

Reload, stop/restart the process, and visit again. There should still be one Field Notes record with the same opening stock. Disable JavaScript and verify the same text arrives in the HTTP response. Run `pnpm test` in this app to check one-time seeding, owner-scoped lookup, and draft exclusion with an isolated in-memory database.

If the file cannot open, check the working directory, configured path, and write permissions. If a book is missing, check its owner and publication state before changing the template. Continue with [accounts and private catalogs](/docs/tutorial-accounts).
