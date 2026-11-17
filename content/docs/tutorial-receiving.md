---
title: Tutorial 4 — receive stock safely
description: Commit stock and receipt history atomically, reject stale writes, and distinguish identical retries from new deliveries.
section: Guides
---

Receiving records physical copies arriving at the shop. This is a durable operation: the new on-hand quantity and its receipt must agree after a reload, a replayed request, or a failed database statement.

## Generate and prepare a book

From the Lithono checkout:

```shell
node tools/docs-project.mjs bookstore-receiving ../chapter-house-receiving
```

Configure/start the app using [the account chapter](/docs/tutorial-accounts#generate-and-configure). Register and create a draft using [the editing chapter's sample values](/docs/tutorial-editing#generate-and-try-the-checkpoint). Follow **Receive a delivery** from the edit page.

Receive **5** copies with reference **DELIVERY-ONE**. Expect **5 copies on hand** and one history entry. Then receive **2** with **DELIVERY-TWO**; expect **7 copies on hand** and two entries. Reload to confirm both were saved.

## Keep stock vocabulary precise

Here `stock` means **on-hand stock**, the physical inventory recorded by the application. A receipt increments it. Opening seed balances are not receipt-history entries. Publication controls visibility, independently of stock.

Future sales/checkout work needs separate on-hand, reserved, and available quantities. The current tutorial's receiving operation does not reserve stock, create an order, or deduct inventory for shipping.

## Commit stock and receipt together

Complete file: `src/server/receiving.ts`.

```ts source="examples/docs/bookstore/receiving/src/server/receiving.ts"
```

The `(owner, token)` uniqueness constraint identifies one attempted receipt. The transaction first checks whether that token already succeeded:

- Same book, quantity, and reference: return the saved receipt without incrementing stock again.
- Different details: reject the reused token.
- New token: check the submitted version, increment stock, and insert the receipt atomically.

The replay lookup precedes the stale-version check because a successful retry naturally carries the older version from its original request. The owner scope applies to both lookup and update. If the receipt insert fails after the stock UPDATE, rollback restores the original stock/version.

## Validate and authorize at the action boundary

Complete file: `src/pages/admin/[id]/receive/page.ts`.

```ts source="examples/docs/bookstore/receiving/src/pages/admin/[id]/receive/page.ts"
```

The loader generates a token for a new attempt and reads the current version/history. The action validates the UUID, whole-copy quantity, and reference, then resolves the owner independently. A token is replay identity, not an authentication credential.

## Use an ordinary form

Complete file: `src/pages/admin/[id]/receive/page.html`.

```html source="examples/docs/bookstore/receiving/src/pages/admin/[id]/receive/page.html"
```

On native failure, the old version/token and submitted fields remain visible. On enhanced success, the refreshed loader supplies a new token/version and the form resets for the next delivery. The history and on-hand count are the durable confirmation, not merely the success event.

This checkpoint gives receiving its own route so the operation can be understood independently of the product editor. The showcase's [larger receiving guide](/docs/receiving-stock) demonstrates two forms sharing one editor page.

## Prove the transaction and retry rules

Complete file: `tests/receiving.test.ts`.

```ts source="examples/docs/bookstore/receiving/tests/receiving.test.ts"
```

Run `pnpm test` from the generated app. The test forces a receipt insert failure after the stock UPDATE and verifies rollback, in addition to identical replay, changed replay details, stale version, and cross-owner rejection. The browser gate also submits the real HTTP operation with JavaScript both enabled and disabled.

For a stale receipt, compare current inventory and reload deliberately before recording a fresh delivery. For a network failure after submission, retrying the identical token/details is safer than inventing another token while the outcome is unknown. Continue with [publication and public shops](/docs/tutorial-publishing).
