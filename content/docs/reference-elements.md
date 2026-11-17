---
title: Component, page, and layout classes
description: Reference render roots, component helpers, generated route hosts, registration, and lifecycle ownership.
section: API reference
---

Import these classes from `lithono/client`. Start with [components and ownership](/docs/components) if web components are new to you. A class describes an HTML element; Lit's reactive properties tell it when to update.

## LithonoElement and Lithono

`class LithonoElement extends Lithono(LitElement)` is the usual base for a component trio. `Lithono(Base)` is a mixin for an existing `HTMLElement` subclass; it supplies framework helpers and render-root behavior. Use a Lit-compatible base when you need reactive rendering. The mixin does not turn a plain element into a complete Lit implementation.

| Member | Contract |
| --- | --- |
| `static root: RootKind` | Defaults to `light`; see root modes below |
| `static lithonoStyles: string[]` | Stylesheet metadata; defaults to `[]`, normally supplied by the compiler |
| `staticRoot` | Effective root mode of this instance |
| `pageData<T>()` | Current page-loader snapshot cast to `T`; not a subscription |
| `actions<TActions>()` | Callable actions from a containing page when available, otherwise the current route snapshot |
| `lithono` | Current `LithonoData` snapshot |
| `revalidate(): Promise<void>` | Browser request to rerun the current page/layout loaders; resolves without work on the server |
| `renderLight()` | SSR rendering hook for non-shadow roots; normally framework-managed |

`LithonoHost` describes the instance helpers. A generic argument such as `pageData<ProductData>()` supplies a TypeScript assertion, not runtime validation. Use [controllers](/docs/reference-controllers) for subscriptions and ordinary property bindings for reusable components that should not know about the current route.

## Render roots

`RootKind` is `'light' | 'host' | 'shadow'`.

| Mode | Ownership |
| --- | --- |
| `light` | Renders into the element itself; application CSS can style the output |
| `shadow` | Uses Lit's shadow root and declarative-shadow hydration support |
| `host` | Renders into a detached fragment, leaving parent-supplied light DOM in place |

Use `host` for an enhancement of existing markup, such as copying server-rendered code. It is not a second renderer for those child nodes. `detachedRenderRoot(): HTMLElement | DocumentFragment` is the advanced helper behind this behavior; it supplies a minimal fragment placeholder during SSR. It is not a general server DOM implementation.

The light-root update path adopts existing SSR markers on the first update and uses incremental rendering afterward. Do not clear `innerHTML`, move template markers, or stamp the same region with another renderer.

## LithonoPage

`LithonoPage` is the base of generated page templates. Its static defaults are `root = 'light'`, `tagName = 'lithono-page'`, and `hydrate = false`; compilation supplies the actual route tag and hydration decision.

| Instance member | Default / purpose |
| --- | --- |
| `data` | Page loader result, initially undefined |
| `params` | Route parameters, initially `{}` |
| `url` | `URL`, absolute/relative URL string, or undefined |
| `path` | Pathname, initially `''` |
| `pageUrl` | Normalized `URL`; server fallback origin is `http://lithono.local` |
| `descriptors` | Action descriptors, initially `{}` |
| `failure` | Optional `ActionFailureContext` |
| `actionMap` | Callable descriptor view; unknown action property reads throw with the known action names |
| `providedActions` | Reactive context projection of `actionMap` |
| `session` | Explicitly public session projection |
| `applyBootData()` | Copies the active route snapshot onto this host |

Pages provide data, params, actions, and session contexts and own a `FormSubmitController`. Connection applies browser boot data before the normal lifecycle; `lithono:revalidate` reapplies it. Disconnect removes that listener. Most applications should author `page.html` and server exports rather than instantiate this class directly.

## LithonoLayout

`LithonoLayout` has the same light-root/static-hydration defaults, `data`, `params`, `url`, `path`, `pageUrl`, `applyBootData()`, and inherited helpers. It also owns a form controller.

Its `layoutId` reflects `data-lithono-layout-id` and selects **that layout's** loader data from `LithonoData.layouts`. `pageChildren` is the opaque outlet rendered by `${children}` in a layout template. Never move or recreate the child outlet yourself.

A layout does not provide the page's four contexts. `pageData()` still reads the current **page** snapshot, not the layout's own `data`. Access a layout-loader value as `data.*` in its template. See [route module contracts](/docs/reference-routes) for loaders and retained-layout identity.

## Registration and template helpers

`defineFromFilename(tagOrUrl, ctor): void` derives a tag when given a path/URL or accepts an explicit tag. `redefineCustomElement(tag, ctor): void` defines a new tag or copies prototype/static descriptors onto its existing definition for SSR/HMR. A tag without a hyphen throws. This is not a general replacement for creating a new custom-element identity: the registered constructor remains the existing one.

The compiler normally supplies registration and the sibling HTML/CSS connection. Avoid registering an additional, mismatched tag in a trio.

`html`, `nothing`, `unsafeHTML`, and `renderLight` are available from both `lithono` and `lithono/client`; the client entry also exports `noChange` and `repeat`. `html` creates a Lit template, `nothing` renders no value, `noChange` retains a binding, and `repeat(items, key, template)` supports keyed list identity. `renderLight()` is a framework composition directive, not a command to rewrite a DOM subtree. `unsafeHTML` inserts deliberately trusted HTML; ordinary expressions escape text.

## Lifecycle and availability

Component construction and `render()` can run during Node SSR. Browser APIs belong in connected/updated lifecycle work with appropriate environment guards. Call `super.connectedCallback()` and `super.disconnectedCallback()` when overriding them, and release subscriptions, timers, and widgets on disconnect. Browser enhancement can reconnect a retained component later.

The browser entry is importable during framework SSR, but navigation, action invocation, and DOM enhancement require a browser. A `hydrate = false` page can still contain independently enhanced components; it does not guarantee the whole document has no JavaScript. See [rendering](/docs/rendering) and [debugging](/docs/debugging).
