# Migrating existing Lithono applications to 0.1.0-alpha.1

This release changes the source-only prototype's wire protocol and rendering contracts. Migrate each of your existing applications independently and deploy rebuilt client and server artifacts together. The example application in this repository has been migrated; external applications have not been changed.

## 1. Install the package and supported tooling

The root repository is now `lithono-demo`, a private pnpm workspace application. The publishable framework is `packages/lithono`; its build consumes `src/framework` without moving your existing source work. `packages/create-lithono` distributes a small independent starter.

```sh
# Framework checkout:
pnpm install
pnpm build:packages
pnpm --filter lithono pack --pack-destination /tmp/opencode

# Existing application:
pnpm add /tmp/opencode/lithono-0.1.0-alpha.1.tgz lit@3.3.3
pnpm add -D vite@^8.2.0 typescript@~5.9.3
```

Keep Hono and the Node server dependencies required by your server entry. Install `better-auth` and `animejs` only if your application uses those integrations. Lithono's package supplies compiled ES modules, declarations, CLI templates, and internal assets; applications do not need TypeScript runtime loading or aliases into this repository.

The alpha pins Lit 3.3.3 and its SSR integrations to the verified hydration combination. Upgrade that combination only after running the ownership/browser gates. The development typechecker is TypeScript 5.9, compatible with the installed ESLint tooling; TypeScript 7 is no longer the default.

For pnpm 11, the starter includes this build policy:

```yaml
allowBuilds:
  esbuild: true
  rs-module-lexer: true
```

Remove application `tsconfig` paths and Vite aliases pointing into Lithono's source checkout when switching to the installed package. Keep `experimentalDecorators: true` and `useDefineForClassFields: false` for existing Lit decorator authoring.

## 2. Update imports

```ts
// Before:
import { defineConfig, node, deriveFields } from 'lithono';

// After (in build/server modules only):
import { defineConfig, node } from 'lithono/config';
import { deriveFields } from 'lithono/server';
```

The root is browser-safe. Field derivation remains server-side so its Zod implementation does not enter the root's browser graph. Shared URL schemas import from `lithono/url`. Component controllers import from `lithono/client`.

Use `import type` for server action types consumed by client components. Client builds reject resolved transitive imports of server modules, route scripts, `.server.*`, `lithono/config`, `lithono/vite`, `lithono/server`, and server auth entry points. Moving secrets behind a re-export or alias does not bypass this boundary.

## 3. Migrate actions and redirects

```ts
// Before:
return { success: true, redirect: '/lists' };

// After:
import { redirect } from 'lithono';
redirect('/lists');
```

Application keys `redirect`, `revalidate`, and `__lithono` are now ordinary result data. The versioned envelope carries framework metadata separately. Primitives, arrays, null, and top-level undefined retain their intended result shape.

To suppress automatic loader refresh, send `X-Lithono-Revalidate: 0` or use `data-revalidate="false"` on an enhanced form. Returning `{ revalidate: false }` no longer suppresses refresh.

Custom transport/unwrap code must understand the v1 envelope and protocol response header. Prefer framework-bound actions rather than parsing raw JSON yourself. Raw JSON Responses remain application data; non-JSON successful Responses are returned as Responses; 204/205 returns undefined. Redirect actions navigate and do not promise to return application data.

Unexpected server exceptions are logged server-side and return generic failures. A successful mutation followed by failed loader refresh remains successful and emits `lithono:revalidate-error`; provide recovery UI where appropriate. Unsafe actions reject cross-origin provenance. Reverse proxies must present the correct public request URL. Missing Origin/Referer is allowed for nonbrowser/privacy clients unless Fetch Metadata contradicts it; do not confuse this policy with application authorization.

## 4. Explicitly project public identity

Server locals still contain application/authentication data, but public `user` and `session` now default to null.

```ts
createLithonoApp({
  plugins: [authPlugin({ auth })],
  auth: {
    publicUser: ({ user }) => user
      ? { id: user.id, email: user.email, name: user.name }
      : null,
    publicSession: ({ session }) => session ? { signedIn: true } : null,
  },
});
```

Callbacks receive the request context and may be async. Return only deliberate, JSON-compatible public fields. The same projection is used during SSR, boot, and refresh.

These callbacks belong under `createLithonoApp({ auth: { ... } })`; move any earlier top-level `publicUser`/`publicSession` options into `auth`. This group selects browser-visible authentication data, not an authentication provider. Cookies and full server-side locals still work when public projections are null; most applications need only `auth.publicUser`, if either projection is needed.

Route middleware now uses Hono's native composition. Return a Response or set `c.res` to stop a request; call `await next()` once to continue. Locals are collected after route middleware so they can read its context variables. Post-next response/header changes work normally.

## 5. Adopt the render-state and DOM ownership contract

Loader/projection values are plain JSON data: finite numbers, strings, booleans, null, arrays, and plain objects. Convert Date/Map/class instances to explicit plain representations. Rich instances, bigint, functions, non-finite numbers, and cycles are rejected before SSR. Undefined object fields are omitted; undefined roots and array entries become null.

Full URLs, params, failures, action descriptors, and identified layout data now travel consistently through SSR, boot, and refresh. Do not depend on layout tag-name uniqueness or array order to identify a layout. The compatibility arrays remain available, but new layout state uses `{ id, data }` records.

Remove overrides of `parentOwnsLightDom`, `deferFirstLightRender`, `deferLightDomRestamp`, `takeoverLightDom`, and `restampProperties`. Pages, layouts, and light components now hydrate their owned render roots and update incrementally. Import framework `renderLight` instead of the labs directive directly. Trio compilation already selects the correct directive.

Ordinary light-DOM `createRenderRoot()` overrides are supported, but are unnecessary when using the framework's default light root. Browser-only lifecycle work, such as `closest()` or attaching UI listeners, must be guarded during SSR. Loader data containing an auth user should project plain fields instead of returning Date-bearing authentication records. See [real demo verification](demo-app-verification.md) for the integration regressions these rules caught.

Keep layout outlets in structurally stable templates. Replacing a conditional containing an outlet still deliberately removes that subtree. Do not move a queried page node into `pageChildren` or restamp the nested route yourself. Use stable keys for repeat lists.

Base hosts no longer create four context consumers automatically. `pageData()` and `lithono` are snapshot conveniences. Use explicit `PageDataController`, `ActionsController`, `ParamsController`, `SessionController`, or reactive context decorators when a component must track changes. A provided null is intentional and no longer falls back to a global payload.

## 6. Opt into URL-backed view state

```ts
// Shared browser-safe module:
import { defineQuery, query } from 'lithono/url';
export const filters = defineQuery({
  search: query.string(),
  page: query.integer({ default: 1, min: 1 }),
});

// Server loader:
const values = filters.read(url);

// Page-owned client instance:
import { createUrlState, revalidateUrlState } from 'lithono/client';
const state = createUrlState(filters, { revalidate: revalidateUrlState });
state.start();
await state.patch({ search: 'lit', page: 1 }, {
  history: 'push', effect: 'revalidate',
});
```

Share one state instance through properties/context when multiple components coordinate a view. Each component subscribes/unsubscribes; the owner manages start/stop/dispose. Separately created instances do not synchronize each other's local history writes. `UrlController` offers component-owned Lit lifecycle integration.

Every update explicitly chooses history and navigation/local/revalidation behavior. Native GET forms remain the no-JavaScript baseline. Defaults, repeated parameters, and invalid-value policy are documented in [URL state](url-state.md). Local changes require sufficient existing data; server filter changes need navigation or revalidation. Private drafts and transient interaction state belong elsewhere.

## 7. Preserve native form behavior

Enhanced forms respect submitter name/value, `formaction`, `formmethod`, `formenctype`, `formtarget`, `formnovalidate`, repeated values, files, disabled controls, native validity, and form-associated custom controls.

Native GET submissions replace the action query. Put `_action` and any preserved query fields in successful controls where necessary. `text/plain` actions must process the raw body rather than rely on structured form parsing. Cross-origin, different-path, targeted, and `data-lithono-native` forms retain native behavior.

Keep native constraint attributes in SSR markup for no-JavaScript validation. Server validation remains authoritative. Failed enhancement does not automatically retry a mutation through native submission. Use accessible error slots/status UI; the controller associates errors and focuses invalid controls.

## 8. Register external and browser-only components

```ts
export default defineConfig({
  elements: {
    'wa-button': {
      import: '@awesome.me/webawesome/dist/components/button/button.js',
      mode: 'client-only',
    },
    'vendor-card': { import: './src/vendor/card.js', mode: 'ssr' },
  },
});
```

Each import must register its tag. Map every used tag; explicit mappings override filename discovery. Browser-dependent modules need `client-only` and useful fallback children. Local discovery supports TS/JS/MJS and `.client.*`. SSR registration errors fail startup with the offending import identified. Vanilla elements needing pre-upgrade property handling must implement that platform pattern themselves.

The `elements` list is an optional catalog, not imports for every page. Browser loading is selected from the current route's rendered tags, template references, and known dependencies; unused entries remain lazy. Conditional template references may load in advance of becoming visible. SSR-safe catalog entries register once at server startup, independently of client selection.

Ordinary registration imports in component modules/trios are also supported without config mappings. They follow normal module dependency semantics. Keep imports server-safe if their owner executes during SSR, or use an explicitly browser-only module/code path. See [component loading](phase4-components-migration.md) for both authoring options.

## 9. Build and deploy both output trees

Prefer `inline: 'styles'` for whole-route inlining or `inline: 'none'` for links. `critical` and `all` remain aliases, without extraction. Production embeds processed CSS, document envelope, configuration, and manifest at build time. Rebuild when changing them; do not edit source files beside a deployed artifact expecting request-time changes.

Unenhanced routes no longer emit boot JSON or bootstrap. Code depending on global boot state must run only where enhancement is enabled. Readable Lit dependencies retain diagnostics. Unsupported Cloudflare/non-Node adapters and explicit prerender requests fail rather than generate placeholders.

```sh
pnpm typecheck
pnpm check
pnpm build
pnpm serve
```

Deploy both `dist/client` and `dist/server` with runtime dependencies. The example authentication database needs its own Better Auth migrations; framework deployment does not provision your schema.

## Verify each migrated application

Exercise its real pages with and without JavaScript, direct query links and refreshes, Back/Forward, native/enhanced mutations, redirect actions, validation errors, nested layout refreshes, focused drafts, and third-party component upgrades. The framework fixtures prove those boundaries in isolation; they do not substitute for your apps' data/authentication integration tests.

Detailed implementation notes remain linked from [the alpha release record](RELEASE_ALPHA.md).

## Framework findings from the expanded showcase

Use a freshly built artifact after the showcase changes: ancestor-first hydration
supplies non-attribute child properties before release, late configured elements
load when inserted, native redirects retain cookies and the page query, textarea
SSR preserves native defaults, raw source imports stay literal, structural directives
retain native table/select content, and explicit loader HTTP errors keep their status.
Browser error-display helpers are also separated from server schema inspection,
so enhancement does not load Zod merely to display issues. These shared fixes have
regressions in the framework and real-app suites; new showcase domain integrations
are application code, not extra framework requirements. See `SHOWCASE_ROADMAP.md`
and the per-phase handoffs for evidence and scoped limits.
