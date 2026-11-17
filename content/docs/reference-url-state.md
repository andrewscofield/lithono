---
title: Query and URL-state reference
description: Reference shared codecs, query reads/writes, browser state lifecycle, update effects, and refresh callbacks.
section: API reference
---

Import shared codecs from `lithono/url`. Import browser coordination from `lithono/client`. The [URL-state guide](/docs/url-state) explains when these APIs are useful.

## defineQuery

`defineQuery(shape)` accepts a record of `QueryCodec` values and returns a frozen query definition.

| Method | Result |
| --- | --- |
| `read(input, options?)` | Frozen, typed values parsed from a URL, URLSearchParams, or query string |
| `write(input, patch)` | New URLSearchParams; unrelated parameters preserved |

`read` defaults invalid values to their codec defaults. `{ invalid: 'throw' }` instead throws `QueryValidationError`, whose `issues` contain key, raw values, and message.

`write` validates patched values, removes default-valued keys, and preserves repeated encoded values. `undefined` resets a declared key to its default. Unknown patch keys throw rather than silently changing the contract.

## Built-in codecs

| Codec | Options / behavior |
| --- | --- |
| `query.string` | `default` defaults to empty; optional `validate(value)` predicate |
| `query.enum(values, options)` | Nonempty string tuple and required allowed `default` |
| `query.integer` | `default` defaults to 0; optional `min` and `max`; safe integers only |
| `query.boolean` | `default` defaults false; URL values are exactly `true` or `false` |
| `query.array(item, options)` | Repeated keys using a single-value item codec; default is an empty readonly array |

Scalar codecs reject repeated values. Defaults are checked against the codec's own rules.

A custom `QueryCodec<T>` supplies `default`, `decode(readonly string[])`, and `encode(value): readonly string[]`. Ensure values round-trip; writes check representability.

## createUrlState

`createUrlState(definition, options?)` creates browser coordination. It requires a browser or an explicit environment adapter and must not run during ordinary server rendering.

| Option | Default / behavior |
| --- | --- |
| `invalid` | Default invalid query values; use `throw` for strict reads |
| `environment` | Browser window when available; custom adapters can provide location/history/events |
| `revalidate` | Optional callback for refresh effects |
| `popstateEffect` | Revalidate when a callback exists, otherwise local; active browser router owns the navigation refresh |
| `onError` | Receives errors from event-triggered work such as history changes |

Direct async operations reject to their caller on a current failure; handle those rejections as well as event-level errors.

## Instance lifecycle and methods

| Member | Behavior |
| --- | --- |
| `current` | Current immutable snapshot |
| `subscribe(listener)` | Immediately invokes the listener; returns an idempotent unsubscribe function |
| `start()` | Reads current location and attaches history/router-change listeners; repeated starts are safe |
| `stop()` | Removes listeners and invalidates pending refreshes; instance may restart |
| `dispose()` | Stops, clears subscriptions, and permanently disposes the instance |
| `patch(values, update)` | Validates, changes the URL, publishes, and performs the chosen effect |
| `refresh()` | Refreshes the current snapshot using the configured callback |

Create a new instance after permanent disposal. Clean up in the owning component's disconnect lifecycle.

## Patch update options

Both fields are required:

| Field | Values |
| --- | --- |
| `history` | `push` or `replace` |
| `effect` | `navigate`, `local`, or `revalidate` |

`navigate` uses the router when active in the browser, otherwise location assign/replace. `local` updates history and subscribers without requesting loader data. `revalidate` requires a callback and refreshes after the URL update.

Patch filters and pagination together when they are one view transition. Separate writes can expose intermediate views and duplicate requests.

## Snapshots and refresh requests

`UrlSnapshot` contains typed `values`, the absolute `href`, and a monotonically invalidated `generation`.

A `UrlRefresh` also includes an abort `signal` and `isCurrent()`. A custom `revalidate` callback can return a synchronous commit function or a promise resolving to one. Lithono runs that commit only while the request is current.

`revalidateUrlState` is the framework adapter that refreshes loader projections. It can be supplied directly as the callback.

```ts
import { createUrlState, revalidateUrlState } from 'lithono/client';
import { defineQuery, query } from 'lithono/url';

const definition = defineQuery({ page: query.integer({ default: 1, min: 1 }) });
const state = createUrlState(definition, { revalidate: revalidateUrlState });
state.start();
await state.patch({ page: 2 }, { history: 'push', effect: 'revalidate' });
state.dispose();
```

## Multiple instances and history

Started browser instances observe shared router transitions and each other's browser URL writes. Back/Forward gets one router-owned server refresh when that router is active.

A custom `UrlEnvironment` supplies `location.href/assign/replace`, `history.state/pushState/replaceState`, and add/remove listeners for `popstate` and `lithono:url-change`. Its navigation/refresh behavior remains explicit; do not assume browser-router coordination is available in an arbitrary adapter.

## Exported query and state types

`lithono/url` exports `QueryCodec<T>`, `QueryShape` (a codec record), `QueryValues<S>` (readonly inferred values), `QueryPatch<S>` (optional inferred values, with undefined resetting defaults), `QueryInput` (`URL | URLSearchParams | string`), `QueryIssue`, `ReadOptions`, and `QueryDefinition<S>`. `QueryValidationError` is the runtime error class as well as its instance type. Read options accept `invalid?: 'default' | 'throw'`.

`lithono/client` exports `UrlEnvironment`, `UrlSnapshot<S>`, `UrlRefresh<S>`, `UrlStateOptions<S>`, and `UrlUpdateOptions`. These describe the adapter, snapshot, refresh request, instance options, and required patch effects respectively. [UrlController](/docs/reference-controllers#urlcontroller) adds host lifecycle management without changing the shared query contract.
