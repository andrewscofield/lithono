---
title: Debugging templates, requests, and hydration
description: Trace failures through compilation, server requests, browser enhancement, and refreshed data using generated artifacts and observable behavior.
section: Guides
---

Begin with the failing boundary: does the initial HTTP response fail, does the browser fail to enhance it, or does a later operation show stale data? A browser-only error and a server action error need different evidence.

## Reduce to a small page

Start from a [tutorial checkpoint](/docs/tutorial-checkpoints), or replace a complex view temporarily in your own reproduction with a loader returning a plain object and a template reading `data.*`. Add the form, repository, and browser widget one at a time.

Run `pnpm typecheck`, `pnpm check`, then `pnpm build` in the affected app. Preserve the first useful diagnostic, including the source file, line/column, and its cause. Repeated reloads can hide a cold-cache issue without explaining it.

## Template and scope errors

Route loader values use `data.product`, `data.search`, and similar explicit bindings. `params`, `url`, and page `actions` are separate framework values. Loop variables and component fields keep their own scope. A layout uses `children` for its outlet; it does not inherit the page action-map template variable.

If a value is undefined, inspect the loader's actual return shape and the correct host's data. A layout's `data` is not the page's data. A generic assertion in `getPageData<T>()` or a controller cannot make a missing property exist.

Use `@/` only for application source imports rooted at `src/`. Vite/build config runs before application alias resolution; use its normal imports. Browser components must use `import type` for route action types rather than importing server modules as runtime dependencies.

## Read build inspection output

A standard build writes:

| Path | What to inspect |
| --- | --- |
| `dist/inspect/manifest.json` | Template tags, hydration decisions/reasons, loader keys, registration, imports, and styles |
| `dist/inspect/compiled/` | Generated template modules and component injection, with source maps |
| `dist/inspect/bundled/` | Readable copies of relevant emitted browser chunks |
| `dist/client/.vite/manifest.json` | Actual browser asset mapping |
| `dist/server/` | Node server output and generated integration modules |

Inspect artifacts after rebuilding the failing source. They explain what the compiler produced; do not edit generated output as the fix. Builds retain readable names and source maps, but HTML bindings do not yet receive full semantic TypeScript checking.

If hydration unexpectedly appears, check for event bindings, exported actions, an explicit `hydrate` override, and independently enhanced child components. `hydrate = false` on a page does not disable every component in the document.

## Separate initial HTML from enhancement

Disable JavaScript and request the page. If the content is already wrong, inspect the loader/server render, not the click listener. If it is correct until upgrade, capture browser console errors and failed script requests. Confirm a client-only mapping actually registers the configured tag.

Do not remove `defer-hydration`, SSR comments, or rendered children to force a component to wake up. The bootstrap releases ownership boundaries in order. Clearing a hydrated subtree can make the next Lit update target missing markers.

For third-party widgets, keep one dedicated container and one owner. If a widget replaces content also rendered by a parent template, isolate its subtree and implement disconnect cleanup. For a late custom element, test the cold first load as well as a warm reload.

## Inspect form and action requests

In browser network tools, check the actual destination, `_action`, method, effective submitter attributes, encoding, Origin, status, and response headers. A form targeting another pathname is intentionally left native by the form controller. `data-lithono-native` also opts out.

Check native `invalid` events and HTML constraints when clicking appears to do nothing; the browser can stop submission before a submit event occurs. For enhanced forms inspect `data-state`, `aria-busy`, `[data-form-error]`, and `[data-error-for]`. Listen for form result events on the owning page/layout, since the controller dispatches from that host.

`ActionRequestError` carries status and optional issues. Other thrown errors can be network/protocol failures. A successful mutation with `lithono:revalidate-error` means the refresh failed separately: refresh or inspect durable state before retrying the write. See [form lifecycle](/docs/reference-forms).

## Authentication and server diagnostics

Check Better Auth's base URL, trusted origins, mount path, request cookies, and Set-Cookie response headers together. A localhost/127.0.0.1 or port mismatch can change origin/cookie behavior. Native HTML may redirect while a JSON action correctly returns 401.

An authenticated server request can still have null public user/session projections by design. Inspect server locals separately from `getLithonoData()` and configure only the needed public projection. A successful login helper does not rewrite the current locals; use a fresh redirected request.

Expected `HttpError` messages follow `expose`; unexpected errors are logged server-side and use generic fallback responses. Keep diagnostic stacks on the server. Provider failures should be traced through the original server error/cause, not copied wholesale into public loader data.

## Navigation and stale views

The router emits `lithono:navigation-error` on `document` and presents a retry link on failure. An awaited `navigate()` call in the active router does not necessarily reject when the destination fails. Capture the event and failed response.

For stale data, distinguish a local URL-state patch from a revalidating patch, and a snapshot read from a context subscription. Check whether the page/provider actually hydrates. A snapshot refresh updates bound hydrated hosts; it is not a complete HTML replacement for static markup. Consult [controllers](/docs/reference-controllers) and [navigation](/docs/reference-navigation) for the exact contracts.
