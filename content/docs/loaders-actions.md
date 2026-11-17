---
title: Loaders and actions
description: Keep reads, mutations, validation, and view projections explicit at the server boundary.
section: Learn Lithono
---

A loader prepares a view. An action performs a requested operation. Both execute on the server, where application code can access databases and private provider credentials.

## Return a view projection

```ts title="Illustrative loader"
import type { Loader } from 'lithono';

export function loader({ url }: Loader) {
  const search = (url.searchParams.get('q') ?? '').slice(0, 200);
  return {
    search,
    books: [{ id: 'native-web', title: 'The Native Web', stock: 8 }],
  };
}
```

Loader arguments include `request`, `url`, `params`, the Hono context `c`, and application locals. Augment `Locals` when your application injects a typed service.

Return serializable data deliberately. Do not return a database connection, class instance, provider client, or raw account record containing private fields. The projection may be serialized into the document or sent in a loader refresh response.

## Define a mutation

```ts title="A validated action"
import { post } from 'lithono';
import { z } from 'zod';

export const actions = {
  checkDelivery: post(
    z.object({ quantity: z.coerce.number().int().min(1).max(10000) }),
    ({ input }) => ({ acceptedQuantity: input.quantity }),
  ),
};
```

Install Zod with `pnpm add 'zod@^4.5.0'` from your app's directory if using this example. This is a complete action export for `page.ts`, but it does not save inventory. The framework accepts Standard Schema-compatible validation; Zod is the example library rather than a mandatory domain layer. [The delivery-preview checkpoint](/docs/tutorial-checkpoints#checkpoint-2-a-validated-delivery-preview) supplies the accompanying template and loader-backed result.

The schema validates at the request boundary. Coercion is explicit because native numeric form controls submit strings.

## Authorize at the operation

The Chapter House actions derive their workspace from the authenticated request. They do not trust a hidden `workspaceId` supplied by the browser.

```ts source="src/pages/bookstore/admin/[id]/page.ts"
```

This source-backed file belongs to the showcase and depends on its workspace/database modules. [The draft-editing tutorial](/docs/tutorial-editing) supplies a complete independent application with the same authorization pattern. Protect the action even if its containing page has a protected loader: actions are HTTP operations and can be reached independently of the UI that presents them.

## Reconcile the view after a mutation

After an enhanced action, Lithono refreshes relevant loader snapshots and updates their owners. A saved record is durable application state; a temporary draft or focused input is client state. Keep stable keys and avoid overwriting drafts merely because new loader data arrived.

A mutation and its subsequent refresh have separate failure possibilities. If the database commit succeeded but the refresh failed, do not tell the user that the mutation necessarily failed or blindly repeat a non-idempotent operation.

## Redirect or stay on the page

Use `redirect('/destination')` when the operation should navigate. The default status is 303, appropriate for following a successful POST with a GET. The helper throws a redirect response; it does not return a URL string.

Return a serializable result when the operation should remain on the page. The native path redirects back to a fresh page GET; the enhanced path can apply loader refresh data without document navigation. Both share the server action contract; use visible loader-backed state for durable confirmation.

## Separate transaction work from provider I/O

Commit a stock increment and receipt together. Do not hold a synchronous SQLite transaction open across an email or shipping-provider request. Persist the domain result first and model provider delivery/retry separately.

Continue with [forms](/docs/forms), the [action reference](/docs/reference-actions), and the [receiving walkthrough](/docs/receiving-stock).
