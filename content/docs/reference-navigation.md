---
title: Navigation, snapshots, and action clients
description: Reference browser navigation, routing events, public data access, refresh application, and low-level action transport helpers.
section: API reference
---

Import these helpers from `lithono/client`. Prefer native links/forms and the generated page action view for ordinary application work. The lower-level exports support custom integrations and debugging.

## navigate

`navigate(href: string, options = {}): Promise<void>` requires a browser. Relative destinations resolve against the current URL.

| Option | Default / purpose |
| --- | --- |
| `replace` | `false`; replace the current history entry instead of pushing |
| `popstate` | `false`; router history-restoration bookkeeping; normally leave this to the router |

External origins, or calls before router startup, use `location.assign`/`location.replace`. With the router active, same-origin route transitions fetch a complete destination HTML document. A same-path hydrated page can instead receive a JSON loader refresh. Navigation is buffered, not progressive content streaming.

The router retains common layouts by module identity, replaces the changed outlet, loads required components, adds route CSS, and updates title/description on HTML transitions. Snapshot-only refresh does not recompute the browser document title. Full route transitions focus the hash target or `#main-content` and scroll; Back/Forward restores recorded positions when available. Keep a focusable main target in your shell.

## Native navigation and failure events

Ordinary same-origin links and GET forms are eligible for router enhancement. Downloads, modified/non-primary clicks, external links, non-`_self` targets, action links/forms, and `data-lithono-native` opt out. Same-document hash links retain browser behavior.

| Event / attribute | Target and meaning |
| --- | --- |
| `lithono:navigation` | `document`, non-bubbling custom event; detail `{ url }` after a successful transition |
| `lithono:navigation-error` | `document`, non-bubbling custom event; detail `{ error, href }` |
| `lithono:url-change` | `window`, plain event for URL-state coordination |
| `data-lithono-navigating` | Present on the root HTML element while the latest router request is pending |

Superseded navigation aborts are silent. Other router failures leave the existing view and show an alert with a native retry link. The active-router `navigate()` path catches these failures and reports them through the error event/UI; awaiting it is not a guarantee that a transition succeeded. Network operations outside this path can still reject normally.

## Snapshot reads

| Helper | Result |
| --- | --- |
| `getLithonoData(): LithonoData` | Current request/browser snapshot |
| `getPageData<T = unknown>(): T` | Page loader result asserted as `T` |
| `getParams(): Record<string, string>` | Route params |
| `getActions<TActions>()` | `InferActionClient<TActions>` bound to current state coordination |
| `getActionFields(actionName)` | Field constraints or `{}` for an unknown action |

These are reads, not subscriptions. During framework SSR a request-local reader supplies data. Outside a request, empty defaults include `path: '/'`, empty maps/arrays, undefined page data, and null user/session. In the browser the initial snapshot comes from `#__LITHONO_DATA__`; malformed JSON throws. Do not mutate that snapshot directly.

`LithonoData` includes route/path/url, params, page data, layout data and identities, action metadata, selected component modules/tags, hydration metadata, optional failure, and public user/session projections. Those are public transport values, not private server locals.

## Refresh application

`applyRevalidate(payload, request?)` merges a loader refresh into the active snapshot and dispatches a bubbling/composed `lithono:revalidate` event from the page. The payload may include `data`, `layoutData`, `layouts`, `params`, `url`, `path`, `failure`, `user`, `session`, and `actions`. Omitted failure clears the prior failure; explicit null also clears it.

The optional numeric request token belongs to framework state ordering. Prefer `host.revalidate()` or `revalidateUrlState` rather than inventing tokens or applying an unrelated fetch response. `applyRevalidate` updates state, not browser history, and does not stamp fresh HTML into an unhydrated page.

`unwrapActionResult(json, request?)` parses the framework action envelope, applies successful refresh metadata, and returns the application result. An action can succeed while its refresh fails: a current failed refresh emits bubbling/composed `lithono:revalidate-error` from the page. Recover by refreshing the view; avoid blindly repeating a committed mutation.

## Action client integration

`descriptorsFromMeta(path, meta)` builds `Record<string, ActionDescriptor>` with names, verbs, field constraints, and `?_action=` URLs. Missing metadata yields `{}`.

`bindActions(descriptors, path, unwrap?, failure?): ActionView` combines those descriptors with callable behavior and failure bindings (`values`, `error`, `issue(name)`). Descriptor access works during SSR, but calling an action there rejects. This low-level binder does not itself add the shared latest-request/overlapping-mutation coordination used by `getActions()` and generated pages.

`createActionProxy(routePath, actionMeta, unwrap?)` creates a dynamic browser transport proxy. Each action accepts a payload and optional request options: standard `RequestInit` fields plus `url` and `enctype`. An omitted verb defaults to POST. Objects become JSON for mutations; GET objects become query parameters; `FormData` respects native-style encoding and submitter options supplied by the form host. Do not assume an unknown property is a validated action: the low-level proxy can attempt arbitrary names and the server rejects missing actions.

The default unwrap returns envelope result data; it does not apply framework refresh metadata. Prefer the higher-level state-bound client when you need automatic refresh.

## ActionRequestError and responses

`new ActionRequestError(message, status, issues?)` has `name = 'ActionRequestError'`, a numeric `status`, and optional `issues`. Server action errors and HTTP failures reject with it. Fetch failures, invalid protocol versions, and invalid envelopes can throw other error types.

Redirects navigate and resolve without normal result data. Raw successful JSON responses remain application data even if they resemble an envelope. Status 204/205 returns undefined; other successful non-JSON responses return a `Response`. Protocol metadata is recognized by its response header, not by guessing from application keys.

See [actions](/docs/reference-actions), [forms](/docs/reference-forms), and [URL state](/docs/reference-url-state) before building a custom transport.

## Browser bootstrap

`lithono/client/bootstrap` is a side-effect entry, not a collection of named exports. It installs Lit hydration support, attaches the context root, releases scheduled server-rendered elements in ownership order, observes mapped late elements, loads route-selected modules, and starts routing.

The standard document/assets pipeline loads it when enhancement is needed. Importing it manually requires Vite's Lithono virtual modules and a browser document. Do not execute it in Node, import it twice under different identities, or add another router to a standard application. [The executable lifecycle example](/docs/executable-examples) verifies successful mutation/failed refresh, explicit recovery, Back/Forward, and failed destination navigation through these real browser paths.
