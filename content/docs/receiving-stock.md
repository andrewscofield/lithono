---
title: Receive stock and publish a book
description: Walk through the real backoffice workflow, including validation, transactions, replay safety, and storefront visibility.
section: Guides
---

This guide uses the running Chapter House application. Open [your backoffice](/bookstore/admin), sign in, and choose **Night Trains**. The initial product is a draft with zero stock.

For complete independent application setup and runnable checkpoint files, start with [the receiving tutorial](/docs/tutorial-receiving). The source-backed route below is the showcase's combined editor/receiving page and uses its workspace/database dependencies.

## Follow the operation end to end

The product loader derives the workspace from the signed-in user, reads one product in that workspace, and returns stock, receipt history, a fresh receipt token, and the public product URL.

The form posts to `actions.receive.url`. Its schema accepts:

| Field | Purpose |
| --- | --- |
| `version` | Expected product version; detects a stale view |
| `token` | Identifies one delivery operation for safe replay |
| `quantity` | Integer copies received, between 1 and 10,000 |
| `reference` | Delivery-note reference, up to 160 characters |

The server derives the product ID from the route and the workspace from authentication. Neither a hidden product ID nor a supplied workspace ID authorizes an update.

## Read the actual route

```ts source="src/pages/bookstore/admin/[id]/page.ts"
```

The code block is included from the runnable route during content compilation. Its displayed imports and signatures therefore change when the example changes.

## Receive a delivery

Enter three copies with a reference such as `DELIVERY-2026-1015-A`, then submit. The count increases by three and a receipt appears in the history.

The repository commits the stock increment and receipt insert in one transaction. If the insert fails, the increment rolls back. It also caps the resulting on-hand stock at one million copies for this demonstration.

A retried request with the same token, product, quantity, and reference returns the original receipt. Reusing the token with different details is rejected. A disabled button is useful feedback, but it is not the mechanism preventing duplicate stock.

## Recover from a concurrent update

Open the same product in two tabs. Receive a delivery in the first tab. Submit an operation using the stale version in the second.

The repository refuses to apply the stale operation. The submitted values remain available in the error state. Compare the current record, then deliberately reload and reapply if the operation is still appropriate.

Do not silently substitute the latest version number into a failed form: that turns a conflict into an unreviewed overwrite.

## Publish the product

Update the description and set **Storefront visibility** to **Published**. Save, then follow **View product in your shop**.

The customer route reads only published products in that store. A direct URL to a draft returns 404. Receiving a delivery does not publish a draft automatically; those are separate business decisions.

## Confirm native behavior

Repeat the workflow with JavaScript disabled. The server still validates the form and renders stock and receiving history. The enhanced path improves navigation and updates, but the underlying operation remains the same.

The Chapter House example has no checkout in this chapter. When sales and shipping are introduced, physical stock, reservations, cancellations, and shipment events need explicit domain rules. See [the application model](/docs/bookstore) and [forms](/docs/forms).
