# Public API documentation audit

Audited 2026-10-15 against the current working tree, starting with
`packages/lithono/package.json#exports`, then following entry-point re-exports,
implementation files, template compilation, and route discovery. Earlier roadmap
claims were not treated as runtime guarantees. Existing uncommitted work was present
at session start and retained.

## Result and reading map

The original 26 articles covered the primary action/query/config patterns but did
not reference most client integration exports, module/class distinctions, form events,
server utilities, or optional integrations. The next milestone adds 13 articles
(39 total): nine dedicated references and four practical guides/checkpoints. Existing
action/query/config references now cover their remaining exported types/helpers.

All ten package export paths are accounted for below. These tables inventory the
explicit public exports, including advanced helpers. They do not imply that every
illustrative code fence is independently compiled or every lower-level helper is an
equally recommended application entry point.

## Root entry: `lithono`

Source: `src/framework/index.ts`, `define.ts`, `types.ts`, `standard-schema.ts`.

| Exports | Public reference |
| --- | --- |
| `html`, `nothing`, `unsafeHTML`, `renderLight` | `reference-elements`, trusted insertion in `reference-config` |
| `defineAction`, `defineDeleteAction`, `defineGetAction`, `definePatchAction`, `definePostAction`, `definePutAction`, `destroy`, `get`, `patch`, `post`, `put` | `reference-actions` |
| `HttpError`, `redirect`, `LITHONO_ACTION`, `DefinedAction` | `reference-actions` |
| `SchemaValidationError`, `validateSchema`, `StandardSchemaV1` | `reference-actions` |
| `ActionDefinition`, `ActionDescriptor`, `ActionFailure`, `ActionMeta`, `ActionRunContext`, `ActionFailureContext`, `ActionView`, `FieldConstraints`, `FieldInputType`, `HttpMethod`, `InferActionClient`, `InferActionInput` | `reference-actions` |
| `ErrorModule`, `LayoutModule`, `Loader`, `MiddlewareModule`, `PageMeta`, `PageModule`, `RequestContext` | `reference-routes`, `reference-actions` |
| `Locals`, `LithonoPlugin`, `InlinePolicy`, `SchemaOptions` | `reference-server` |
| `LithonoData` | `reference-navigation` |
| `RootKind` | `reference-elements` |

## Client entry: `lithono/client`

Source: `src/framework/client/index.ts` and the referenced client modules.

| Exports | Public reference |
| --- | --- |
| `html`, `noChange`, `nothing`, `repeat`, `unsafeHTML`, `renderLight` | `reference-elements` |
| `LithonoElement`, `Lithono`, `detachedRenderRoot`, `LithonoHost`, `RootKind`, `LithonoPage`, `LithonoLayout`, `defineFromFilename`, `redefineCustomElement` | `reference-elements` |
| `PageDataController`, `ActionsController`, `ParamsController`, `SessionController`, `UrlController` | `reference-controllers` |
| `actionsContext`, `attachContextRoot`, `pageDataContext`, `paramsContext`, `sessionContext`, `actions`, `pageData`, `params`, `session` | `reference-context` |
| `FormSubmitController`, `LithonoFormErrorDetail`, `LithonoFormState`, `LithonoFormSuccessDetail` | `reference-forms` |
| `createActionProxy`, `ActionRequestError`, `bindActions`, `descriptorsFromMeta`, `applyRevalidate`, `getActionFields`, `getActions`, `getLithonoData`, `getPageData`, `getParams`, `unwrapActionResult`, `navigate` | `reference-navigation` |
| `createUrlState`, `UrlEnvironment`, `UrlSnapshot`, `UrlRefresh`, `UrlStateOptions`, `UrlUpdateOptions`, `revalidateUrlState` | `reference-url-state` |

`lithono/client/bootstrap` has no named exports. Its side effects, browser/virtual
module requirements, and ownership-aware startup are covered in `reference-navigation`.

## Server, config, and Vite entries

| Entry | Explicit exports | Public reference |
| --- | --- | --- |
| `lithono/server` | `createLithonoApp`, `LithonoAppOptions`, `LithonoAuthOptions`, `LithonoPlugin`, `discoverRoutes`, `fileToRoute`, `buildElementRegistry`, `tagFromModuleId`, `streamPageResponse`, `deriveFields` | `reference-server` |
| `lithono/config` | `defineConfig`, `node`, `cloudflare`, `LithonoConfig`, `LithonoServerConfig`, `ExternalElementConfig`, `LithonoConfigFn`, `LithonoConfigExport`, `LithonoAdapter`, `CONFIG_CANDIDATES`, `resolveConfigFilePath`, `loadLithonoConfig` | `reference-config` |
| `lithono/vite` | `lithono`, `lithonoViteConfig` | `reference-config` |

Source: `src/framework/server/index.ts`, `server/routes.ts`, `server/elements.ts`,
`server/shell.ts`, `fields.ts`, `config.ts`, `adapters/index.ts`, and `vite.ts`.
Types appearing through inferred signatures are described without claiming they have
their own exported names at the entry point. For example, `ResolvedRoute` is not a
named export from `lithono/server`.

## Query entry: `lithono/url`

`defineQuery`, `query`, `QueryValidationError`, `QueryCodec`, `QueryShape`,
`QueryValues`, `QueryPatch`, `QueryInput`, `QueryIssue`, `ReadOptions`, and
`QueryDefinition` are covered in `reference-url-state`. The existing `url-state`
learning guide remains the conceptual introduction.

## Optional entries

| Entry | Explicit exports | Public reference |
| --- | --- | --- |
| `lithono/auth` | `authPlugin`, `requireUser`, `AuthPluginOptions`, `LithonoUser`, `LithonoSession`, `LithonoAuthApi` | `reference-auth`, practical `authentication` guide |
| `lithono/auth/client` | `createAuthClient` (Better Auth re-export) | `reference-auth` |
| `lithono/animate` | `AnimateController`, `animate`, `createTimeline`, `onScroll`, `prefersReducedMotion`, `stagger`, `PRESETS`, `AnimatePreset`, `PresetParams`, `LithonoAnimateElement` | `reference-animation` |

The auth module's `Locals` augmentation is documented separately from public UI
projection. `AnimateHandle` is declared inside `animate/controller.ts` but is not
re-exported by the package entry; examples do not import it as a public name.

## Source-backed behavioral findings

- Page/layout server module exports are distinct from generated client hosts.
  Layout/page loaders run concurrently; layout authentication cannot guard a child
  loader or an independently called action.
- `ErrorModule.meta` permits an optional `error` field in its type, but runtime
  metadata invocation does not supply it. The special loader receives `ctx.error`.
- Page hosts provide the four built-in contexts; layout hosts do not. Context
  controllers have snapshot fallbacks, decorators do not. A fallback getter is not
  a global boot-data subscription, and static providers never become active consumers.
- Form result events originate on the owning host, not the form. Error detail has no
  action/form field. Browser native invalid handling can preempt the submit path.
  `aria-busy` is toggled as a present/absent attribute; the learning guide CSS was
  corrected to use `[aria-busy]` instead of expecting the value `true`.
- Direct `bindActions`/`createActionProxy` do not add all of the state coordination
  used by generated page action views. Mutation success and refresh failure are
  separate outcomes.
- Active-router navigation catches destination failures, emits an event, and renders
  retry UI. Awaiting `navigate` is not a success assertion. HTML transitions update
  title/description; JSON-only loader refresh does not update document metadata.
- Plugin `ready`/`configure` run in sequence per plugin before routes. Endpoint
  handlers registered by plugins do not automatically collect page locals. App
  locals overwrite earlier plugin locals; private locals are not serialized wholesale.
- Auth locals are private unless projected. `requireUser` distinguishes HTML redirect
  and JSON 401, and auth helpers forward cookies but do not mutate current identity.
- The animation entry registers a browser-dependent element; examples use a
  client-only map. `enter` checks reduced motion, `timeline` and direct helpers do not.
- Node is the supported server target; Cloudflare and prerender remain rejected.
  SSR is collected before the response writer, and the router waits for complete HTML.

## Executable examples and remaining scope

`examples/docs/01-catalog` and `02-delivery-preview` are independent starter overlays.
`pnpm test:docs:checkpoints` packs the actual framework/scaffolder, generates fresh
applications, typechecks real exports with only the application `@/*` path mapping,
checks templates, builds, serves Node output, and verifies HTTP/native/enhanced flows.
The preview intentionally performs no persistent stock mutation.

The testing guide embeds the actual bookstore repository test file through a focused
author-time allowlist entry. The auth guide embeds the existing owner-scoped catalog
route. Both remain expanded in the downloadable Markdown.

The subsequent completion milestone expanded to 47 articles and eight independently
generated examples: five connected bookstore checkpoints plus a lifecycle application
now verify the controller/context/form/navigation/auth/animation scenarios. The earlier
decorator field example was corrected after strict consumer checking, and the auth
setup now records its narrow optional database declaration dependency.

See `reference/engineering/documentation-completion-verification.md` for the completed
four-workstream tutorial/editorial/gate milestone. Broader arbitrary-snippet extraction
remains an enhancement; external-framework comparison fences are still illustrative.

Verification results for this milestone are recorded in
`reference/engineering/documentation-api-verification.md`.
