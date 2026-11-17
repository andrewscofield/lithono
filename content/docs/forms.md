---
title: Forms and validation
description: Build native forms with enhanced submission, accessible errors, and recoverable values.
section: Learn Lithono
---

A Lithono form is an HTML form. Its controls, method, encoding, validation, and submitter behavior remain meaningful before enhancement.

## Connect the form to an action

```html title="Form for the checkDelivery action"
<form method="post" action="${actions.checkDelivery.url}">
  <label for="quantity">Copies received</label>
  <input
    id="quantity"
    name="quantity"
    type="number"
    min="1"
    max="10000"
    required
    value="${actions.checkDelivery.values?.quantity ?? 1}"
    aria-describedby="quantity-error"
  />
  <p id="quantity-error" data-error-for="quantity">${actions.checkDelivery.issue('quantity')}</p>
  <p role="alert" data-form-error>${actions.checkDelivery.error}</p>
  <button type="submit">Check delivery</button>
</form>
```

`actions.checkDelivery.url` is the generated action URL. Use it rather than assembling internal action query parameters yourself.

This form is an excerpt for the `checkDelivery` action in [loaders and actions](/docs/loaders-actions). For complete files that run together, use the [delivery-preview checkpoint](/docs/tutorial-checkpoints#checkpoint-2-a-validated-delivery-preview), then [durable receiving](/docs/tutorial-receiving).

HTML constraints give immediate browser feedback. Server schema validation remains authoritative, including for clients that bypass browser checks.

## Recover from validation failure

The action view exposes submitted `values`, a field-level `issue(name)`, and an action-level `error`. Use nullish fallbacks so empty strings and zero values are not silently replaced with old record data.

Associate messages with controls using `aria-describedby`. Set invalid-state presentation where appropriate and keep the original label available. A server error should not replace the entire form with an unhelpful generic page when the user can correct their input.

## Native and enhanced submission

Without JavaScript, the browser submits the form and the server renders the outcome. With enhancement, the form controller submits the same operation and reconciles the returned state.

Named submit buttons, repeated fields, file inputs, submitter overrides, and successful-control rules matter. Replacing the form with an ad hoc JSON object can accidentally discard those semantics.

To deliberately test native submission, add `data-lithono-native` to the form. For files, use `enctype="multipart/form-data"` and validate the uploaded value on the server.

## Pending and result feedback

Enhanced forms expose state through `data-state` and `aria-busy` and emit lifecycle events. Keep pending feedback local to the submitted form. A disabled button alone is not a durable confirmation or protection against replay.

```css
form[aria-busy] button[type="submit"] {
  opacity: 0.6;
  cursor: progress;
}

[data-form-error]:empty {
  display: none;
}
```

For an operation such as receiving stock, show the new count and persisted receipt. That confirmation survives a full reload and does not depend on a temporary toast.

## Business conflicts are different from invalid input

A valid delivery can still conflict with a newer stock version. Return a meaningful conflict, preserve the submitted quantity/reference, and let staff compare current state before retrying.

The Chapter House edit form keeps the submitted version on a failed operation. Automatically replacing it with the newest version would silently approve overwriting someone else's work.

See [receiving stock](/docs/receiving-stock) for the complete form, [actions reference](/docs/reference-actions) for action-view members, and [form lifecycle](/docs/reference-forms) for exact options, state attributes, and event targets/details.
