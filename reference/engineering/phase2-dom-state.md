# Phase2 DOM ownership and state contract

## Ownership and migration

Every hydrated light-DOM page, layout, and Lithono component owns one Lit render
root. The first update adopts SSR nodes with the public
`@lit-labs/ssr-client` `hydrate()` API; subsequent updates use Lit `render()`.
Refreshes update reactive properties rather than clearing children or deleting
Lit part state. Shadow components use Lit's supported
`lit-element-hydrate-support.js` hook and adopt declarative shadow roots.

Remove overrides of the old `parentOwnsLightDom`, `deferFirstLightRender`,
`deferLightDomRestamp`, `takeoverLightDom`, and `restampProperties` switches.
They no longer participate in ownership. Templates must import the framework's
`renderLight` directive, rather than the labs directive directly. Compiler
output already does this; **no compiler changes were necessary**.

Layouts retain an opaque outlet child part. On the server `pageChildren` is the
nested route template; in the browser it is the ownership-yielding directive.
Do not replace it with a queried page node, insert/move the page, or stamp the
route template again. Layout data and surrounding bindings can update while
the nested layout/page keeps its DOM, focus, draft inputs, and component state.
Keep the outlet in a structurally stable template; deliberately replacing its
containing conditional template is a structural removal, not a state refresh.
Use stable application keys for `repeat()` lists.

### Lit compatibility boundary

Investigated the installed implementations of `renderValue()`,
`LitElementRenderer`, `hydrate()`, and LitElement hydration support. The tested
and supported combination for this change is:

| Package | Verified version |
| --- | --- |
| `lit` | 3.3.3 |
| `@lit-labs/ssr` | 4.1.0 |
| `@lit-labs/ssr-client` | 1.1.8 |
| `@lit/context` | 1.1.6 |

`src/framework/client/lit-ownership-compat.ts` isolates the version-sensitive
bridges. Public directive helpers derive a labs render-light subclass; its
inherited SSR identity is checked at module initialization. Public `hydrate()`
does not skip `lit-node` validation inside `noChange` subtrees. During a
synchronous parent hydration only, the adapter temporarily masks those comment
texts and restores them in `finally`. It preserves all child-part boundaries
and node positions, allowing the child owner to hydrate independently.

SSR also pushes a shadow host before calling `renderShadow()` but schedules a
pop only for iterable shadow results. The compatibility adapter balances that
stack for light/host roots and checks the expected stack top. Otherwise light
DOM context requests are wrongly shadow-retargeted. This is the remaining
internal SSR convention dependency. There are no private Lit part property
writes, hydration-flag writes, or global directive prototype patches.
Run the browser gate before upgrading these packages; wider version ranges
have not been browser-validated by this change.

Framework SSR hosts opt into Lit's supported synchronous connected lifecycle
option, with asynchronous updates suppressed by Lit SSR. Context providers and
consumers therefore see the same tree on the server and client. Component
connected callbacks must remain SSR-compatible (guard browser-only work).

## State contract

SSR, JSON GET refreshes, and action refresh envelopes use the same loader and
projection pipeline:

- `url` is the absolute page URL, including query parameters. Browser refresh
  callbacks preserve the fragment too; fragments are not sent over HTTP.
- `path`, `params`, `data`, actions, public user/session projections, and failure
  bindings are initialized before releasing deferred hydration.
- Native action failure HTML includes posted values/issues in both SSR and boot
  data, using the page URL with `_action` removed. Refresh clears stale failure
  state (`failure: null` on the refresh wire means no failure).
- `layouts` carries `{ id, data }` records. IDs are route-relative layout module
  paths without `.html`/`.ts`, retaining route groups, rather than tag names or
  positions. SSR hosts carry `data-lithono-layout-id`. Multiple instances of the
  same tag work, and identified payload ordering is irrelevant.
- `layoutData` and `layoutTags` remain legacy wire metadata. Legacy refresh
  arrays can update data for the already-identified layouts. New servers send
  identified records, and layouts no longer discover themselves with
  `tags.indexOf()` or bootstrap's `querySelector(tag)`.
- Public user/session default to null. Supply explicit `auth.publicUser` and
  `auth.publicSession` projections in `createLithonoApp`; request locals remain server-only. Projections
  are computed once per state load and shared with SSR, boot, and refresh.

Loader/projection values are **JSON data**, normalized before SSR in every
environment. Plain objects, arrays, finite numbers, strings, booleans and null
are supported. Undefined object fields are omitted; undefined roots/array
entries become null. Date/Map/class instances, bigint, functions, non-finite
numbers, and cycles are rejected. Project dates to strings and rich values to
plain data explicitly. This prevents a rich SSR value silently becoming a
different browser value. Request-local state uses `AsyncLocalStorage`.

### Opt-in context

Base Lithono hosts no longer install four context consumers automatically.
`pageData()`/`lithono` are snapshot helpers. Opt into reactive tree-scoped state
with `PageDataController`, `ActionsController`, `ParamsController`,
`SessionController`, or the context decorators. Decorators subscribe to
updates. Controller null values are preserved instead of falling through to a
global boot value. Pages provide reactive data, params, session, and action
bindings; refresh updates those providers together.

### Refresh generations and URL state

Manual/component/page refreshes and calls from page action maps or
`getActions()` share a latest-started-request generation. Old GET requests are
aborted; late action refresh payloads cannot overwrite a newer request. This
does not cancel server mutations.
When refresh-enabled mutations overlap other mutations or refreshes, a final
current-page refresh reconciles the snapshot after the mutations settle. A
reconciliation failure is reported separately from the successful mutation.

Direct `applyRevalidate(payload)` is an
explicit new authoritative commit. Raw `createActionProxy()` is a transport
API; use framework-bound actions for generation-managed state commits.

`revalidateUrlState` (exported by `lithono/client`) plugs into the completed
URL module without editing `url.ts` or `client/url-state.ts`:

```ts
const state = createUrlState(queryDefinition, {
  revalidate: revalidateUrlState,
});
state.start();
await state.patch({ filter: 'open' }, { history: 'push', effect: 'revalidate' });
// Use state.subscribe(() => host.requestUpdate()) in a Lit controller as needed.
// Pair start/stop with hostConnected/hostDisconnected; dispose when finished.
```

The optional `UrlController` (also exported by `lithono/client`) supplies
that Lit lifecycle integration directly. Construct it with a host, a query
definition and optional URL-state options. Read `controller.value` in render
and call `controller.state.patch(...)` in browser handlers. It reads the
request URL during SSR, installs subscriptions/listeners on browser connection,
and stops them on disconnection. Its default refresh callback is
`revalidateUrlState`; call `dispose()` when permanently retiring the controller.

The callback returns a synchronous commit, honoring both URL-state's
`isCurrent()` and the shared framework generation. Two additive client barrel
exports expose the callback/controller; existing barrel edits were preserved. Phase4 bootstrap
resilience/fallback policy is deferred: hydration errors surface rather than
being hidden by destructive re-stamping.

## Clean fixture and gates

```sh
pnpm install
pnpm exec playwright install chromium
pnpm test:phase2:browser
pnpm typecheck
pnpm exec tsc --noEmit -p tests/phase2-browser/tsconfig.json
pnpm exec tsx --test tests/*.test.ts
pnpm build
```

The fixture supplies an isolated route graph through Vite, uses the actual Hono
app, SSR renderer, boot JSON, and client bootstrap, and requires no database or
application authentication. It uses port 4179, its own Vite cache, and ignored
fixture-local Playwright results. Playwright is the only added dev dependency;
package changes otherwise only add the browser script.

Browser gate: Chromium, four tests covering SSR node adoption, nested same-tag
layouts, light/shadow counters, keyed reordering/state, focus and drafts,
non-destructive outlet refresh, context null/subscription behavior, identified
layout payload ordering, manual/action/URL-state races, and native failure
hydration/projection parity. SSR nodes are captured before bootstrap and checked
for continued connection after refresh.

Node gate: 28 tests, including preserved Phase1 action/middleware/projection
tests, existing URL-state tests, JSON contract rejection/normalization,
interleaved request isolation, and SSR/GET/action state parity. Root and browser
fixture typechecks and client/server production builds pass. Browser coverage is
the isolated development fixture in Chromium, not production-bundle or
cross-browser coverage.
