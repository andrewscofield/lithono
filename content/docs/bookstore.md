---
title: The Chapter House application
description: Follow one bookstore from inventory receiving to published product pages, then grow toward sales and fulfillment.
section: Get started
---

Chapter House is the fictional business used throughout these docs. It has a staff backoffice and a simple customer-facing shop backed by the same catalog.

Try [the showcase](/bookstore) immediately, or [build Chapter House from a fresh starter](/docs/tutorial-bookstore). The connected tutorial supplies complete database/account/editing/receiving/publication checkpoints and a production rehearsal.

## Try the complete first workflow

1. Open [your backoffice](/bookstore/admin) and sign in or register.
2. Open the draft **Night Trains**, or create a new draft product.
3. Receive a delivery using a quantity and delivery-note reference.
4. Confirm the stock count and receiving-history entry.
5. Set storefront visibility to **Published** and save.
6. Follow the product's public shop link. The description, price, and stock come from the same catalog.

Each account gets a separate demonstration workspace. Shop links intentionally expose that workspace's published catalog; drafts remain unavailable through public product routes.

The [example shop](/bookstore/shop/chapter-house) uses a separately seeded fictional catalog, so readers can browse without an account.

## Shared vocabulary

| Term | Meaning |
| --- | --- |
| Product | A sellable edition/SKU with storefront information |
| SKU | A staff-facing stock identifier, unique within a store |
| Slug | A readable product URL segment, unique within a store |
| On-hand stock | Physical copies recorded in inventory |
| Published | Visible in the public catalog; distinct from having stock |
| Receipt | A durable record of one incoming delivery |
| Version | A number used to detect stale edits |

The bookstore uses USD, stores prices as integer cents, and displays them with `$`. For example, `2400` cents is `$24.00`. A zero-stock product can be published and displays “Awaiting delivery”; publication is a merchandising decision, not a stock count.

## What the current chapter implements

- Workspace-owned catalog creation and editing.
- Server-side schema validation.
- Explicit publication state and published-only public reads.
- Optimistic version checks for edits and receiving.
- Atomic stock increments and receipt creation.
- Replay-safe receiving tokens.
- Native forms with browser enhancement.
- Searchable staff and customer catalogs.

Initial seed stock is an opening balance, not an incoming delivery. The receiving history lists subsequent recorded deliveries.

## Growing the business model

Later chapters can add in-store sales, online orders, customers, reservations, and shipping. Those workflows are not implemented by the first chapter.

Before adding checkout, distinguish physical stock from reserved and available stock. An order reservation should reduce availability; shipping should not accidentally deduct the same sale twice. Those are application rules to implement transactionally, not automatic consequences of a framework action.

The docs introduce complexity where it teaches something: an ordinary product page remains simple HTML, while a competing stock update needs conflict handling.

## Use examples independently

The [first-page guide](/docs/first-page) uses a fixture so it runs in a clean starter. The [connected tutorial](/docs/tutorial-bookstore) uses independently generated applications with routes such as `/admin` and `/shop/<owner>`. The [showcase receiving guide](/docs/receiving-stock) uses the larger app's `/bookstore` routes and workspace repository. Both teach the same domain rules; their files are distinct applications with explicit setup instructions.

The example application is application code. Lithono does not require SQLite, this schema, a particular currency, or an ecommerce domain.
