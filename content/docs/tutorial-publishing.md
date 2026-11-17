---
title: Tutorial 5 — publish a public shop
description: Add explicit visibility controls and public owner-scoped routes that exclude drafts before rendering.
section: Guides
---

Staff catalog data and customer-facing catalog data share storage, but have different read contracts. This chapter adds publication controls and public shops while keeping drafts private at the repository boundary.

## Generate and complete the workflow

From the Lithono checkout:

```shell
node tools/docs-project.mjs bookstore-publishing ../chapter-house-publishing
```

Configure/start using [the account instructions](/docs/tutorial-accounts#generate-and-configure). Register, create **The Connected Bookshop** at **2399** USD cents, and receive 5 then 2 copies as in [receiving](/docs/tutorial-receiving).

Back on the edit page, choose **Published** in **Storefront visibility** and save. Follow **View public book**. Expect `$23.99` and **7 copies in stock**. Open the public URL in an anonymous browser context: it remains readable. The fixed sample catalog at `/` is separate from your account's `/shop/<owner>` catalog.

## Make publication an explicit input

Complete replacement file: `src/pages/admin/[id]/page.ts`.

```ts source="examples/docs/bookstore/publishing/src/pages/admin/[id]/page.ts"
```

The schema accepts only `draft` or `published`. The write still matches owner/ID/version, so receiving in another tab can make an older product form conflict. Reload and compare rather than silently discarding the concurrency check.

Complete replacement file: `src/pages/admin/[id]/page.html`.

```html source="examples/docs/bookstore/publishing/src/pages/admin/[id]/page.html"
```

The option's `selected` attribute makes the initial HTML correct with JavaScript disabled. Preserve failed submitted visibility alongside the other fields. Publishing a zero-stock product is valid: it can explain that a delivery is awaited.

## List only public records

Complete files: `src/pages/shop/[store]/page.ts` and `page.html`.

```ts source="examples/docs/bookstore/publishing/src/pages/shop/[store]/page.ts"
```

```html source="examples/docs/bookstore/publishing/src/pages/shop/[store]/page.html"
```

`[store]` is a public catalog identifier. Unlike private backoffice routes, these routes deliberately accept it from the URL and request only published records. An unknown store produces an empty public listing. No full private list is sent and then hidden in CSS.

## Resolve one public book

Complete files: `src/pages/shop/[store]/[slug]/page.ts` and `page.html`.

```ts source="examples/docs/bookstore/publishing/src/pages/shop/[store]/[slug]/page.ts"
```

```html source="examples/docs/bookstore/publishing/src/pages/shop/[store]/[slug]/page.html"
```

The repository matches owner, slug, and publication. Missing/draft books return 404. A loaded book becomes plain presentation data and synchronous page metadata. The template uses text bindings, ordinary links, and a simple stock message.

## Verify both directions

Before publication, the public product URL must return 404. After publication, confirm the same title, description, price, and stock appear anonymously. Switch back to Draft and save; the public URL must return 404 again. The gate tests both transitions through native and enhanced forms.

Use a second account to test private ID guessing: it cannot load or mutate the first account's book, even though the public published page is available. Run `pnpm test` for the owner/publication domain invariants. Finish by [testing and running the production artifact](/docs/tutorial-production).
