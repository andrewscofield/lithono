---
title: Form lifecycle, events, and options
description: Reference native form enhancement, controller ownership, validation, state attributes, event details, and opt-out behavior.
section: API reference
---

Lithono enhances native `<form>` elements through `FormSubmitController` from `lithono/client`. `LithonoPage` and `LithonoLayout` already construct one. No form wrapper element or client-side schema runtime is required. See [forms and validation](/docs/forms) for a first walkthrough.

## Constructor and interception

`new FormSubmitController(host)` registers a reactive controller. The host must be an `HTMLElement` with Lit's `ReactiveControllerHost` lifecycle. Add it yourself only for a custom host that needs this behavior; do not attach a duplicate controller to a normal page/layout.

An eligible form has a `?_action=name` destination on the **current origin and pathname**. The controller respects submitter overrides (`formaction`, `formmethod`, `formenctype`, `formtarget`, `formnovalidate`) and includes the submitter in `FormData`.

It leaves these submissions native:

- Forms with `data-lithono-native`.
- Another origin or pathname, or no action discriminator.
- A target other than empty/`_self`, or `method="dialog"`.
- Events already prevented by another handler.

The owning controller prevents and stops the eligible submit event. A containing layout therefore does not submit it again. An in-flight submission blocks another submission of the same form; it does not deduplicate other forms or guarantee database replay protection.

## Lifecycle and validation

On browser connection, the controller installs submit, focusout, input, invalid-capture, and reset listeners and stamps available constraints. After host updates it stamps again. Disconnect removes the listeners; it does not roll back a server write already sent.

Schema-derived constraints fill missing native attributes. An explicitly authored input type and bounds are preserved. A required boolean schema field does not automatically require a checkbox to be checked: false remains valid. Complex schema refinements still run on the server. `enum` metadata is recorded as `data-enum`; author a real select/radio control rather than expecting options to be generated.

Fields become touched on blur or validation. Subsequent input updates their messages. Native constraint validation and server issues paint `aria-invalid` and connect `[data-error-for="field"]` slots through `aria-describedby`, preserving existing descriptions. Server issue mapping uses the first path segment; structured nested editors need their own issue presentation.

## Form options

| Attribute | Default / behavior |
| --- | --- |
| `data-lithono-native` | Presence opts out of enhancement |
| `data-revalidate="false"` | Sends `X-Lithono-Revalidate: 0`; otherwise successful mutation actions request loader refresh |
| `data-reset-on-success` | Presence resets after successful submission; `reset-on-success` is an alias |
| `data-reload` | Presence reloads after success, before any optional reset |
| `data-confirm="message"` | Prompts before validation/submission; `confirm` is an alias; cancellation leaves state alone |
| `novalidate` | Skips the controller's submit-time validation pass; server validation still runs |
| `data-form-error` | Message slot inside the form, with a host-level fallback; becomes a polite status region |

Presence-based attributes are enabled even when written as `data-reload="false"`. Only `data-revalidate` tests the exact string `false`.

Use native `method="post"` for mutation forms. Non-POST action verbs need the supported action/method-override contract; do not author unsupported HTML form methods. See [actions](/docs/reference-actions).

## Field options and messages

`data-match="otherFieldName"` checks that a control matches another named field. The controller clears its own match validity when rechecking/resetting; it does not clear custom validity owned by another integration.

Override default messages with `data-message-required`, `data-message-type`, `data-message-minlength`, `data-message-maxlength`, `data-message-min`, `data-message-max`, `data-message-pattern`, `data-message-step`, or `data-message-match`. `data-message-enum` is recognized by the message metadata, but enum membership is not a separate client validation pass; native controls and server validation remain responsible.

```html
<form method="post" action="${actions.receive.url}">
  <label>Copies received
    <input name="quantity" type="number" min="1" required
      data-message-min="Receive at least one copy">
  </label>
  <small data-error-for="quantity">${actions.receive.issue('quantity') ?? ''}</small>
  <p data-form-error>${actions.receive.error ?? ''}</p>
  <button type="submit">Receive stock</button>
</form>
```

Render initial issues and values for native/no-JavaScript failures as well. Mark passwords and other sensitive values for deliberate handling rather than blindly echoing a whole submitted record.

## State and events

`LithonoFormState` is `'idle' | 'submitting' | 'success' | 'error'`. The controller writes `data-state` on the **form** and toggles `aria-busy` while submitting. Initial markup has no state unless you author it. Reset clears touched/error presentation and sets idle when no submission is pending. A success-triggered reset can therefore move success to idle shortly afterward.

| Event | Detail |
| --- | --- |
| `lithono:success` | `LithonoFormSuccessDetail`: `{ result: unknown, action: string }` |
| `lithono:error` | `LithonoFormErrorDetail`: `{ message: string, issues?: unknown, status?: number }` |

Both events are dispatched on the **controller host**, with `bubbles: true` and `composed: true`. Listen on the page/layout or an ancestor, not on the form expecting a descendant event. Detail has no form reference. The action name is available on success; error detail has no action member.

The controller's explicit preflight failure emits an error event; the browser's earlier native `invalid` event can stop submission before that path and only paint state/messages. Do not assume one `lithono:error` event for every invalid keystroke or native validity failure.

## Errors, refresh, and durable results

Action rejection sets error state, displays the message, and applies field issues when available. Success means the action returned successfully. A separate loader-refresh failure can emit `lithono:revalidate-error` while the mutation itself succeeded; [navigation and snapshots](/docs/reference-navigation) explains that distinction.

Pending-state suppression is a UI convenience. Chapter House uses version checks, transactions, and receipt tokens for durable conflict/replay behavior. [The receiving tutorial](/docs/tutorial-receiving) provides complete durable-operation files, while [the lifecycle example](/docs/executable-examples#observe-real-form-events) verifies actual form-event targeting and listener cleanup.
