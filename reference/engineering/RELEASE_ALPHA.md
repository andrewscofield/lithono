# Lithono 0.1.0-alpha.1 — local release record

Completed October 10, 2026. This records a locally verified public-alpha candidate. Nothing has been published, deployed publicly, or committed by the implementation session.

## Demo integration follow-up — October 13, 2026

The initial fixture-based verification missed defects in the actual lists/listings demos. Those failures were reproduced and fixed: duplicate light-DOM rendering, browser-only listing lifecycle work during SSR, form messages removing hydration boundaries, rich auth objects in loaders, checkbox constraint inference, blur/submit layout shifts, and server scripts in client dependency scanning.

The browser suite now has **25 passing tests**, including three real-application regressions using an isolated SQLite database and cold dependency cache. These cover list/task CRUD with immediate state updates and retained drafts/nodes, public listing SSR, authenticated signup/create/discount/form-update/validation retry/delete/sign-out/sign-in, and native task forms without JavaScript. Typechecks, the 69-test Node suite, production builds, and the packed-consumer gate passed during this follow-up. See [real demo verification](demo-app-verification.md).

## Phase results

| Phase | Delivered |
| --- | --- |
| 1: Requests and actions | Native Hono middleware composition, v1 action envelopes, exact result shapes, redirect Responses, origin checks, generic unexpected errors, explicit public identity |
| 2: Rendering and state | Incremental light-DOM hydration/updates, stable layout outlets/identities, common SSR/boot/refresh projections, JSON data contract, opt-in context, refresh generations and post-mutation reconciliation, URL query contracts and subscriptions |
| 3: Compiler and boundaries | Parser-backed lexical/module analysis, literal escaping, source diagnostics/maps, generated syntax checks, inspection manifest, resolved transitive server/client boundaries |
| 4: Forms and components | Native submitter/encoding/validation semantics, repeated values/files, accessible errors, external tag mapping, JS/MJS discovery, independent hydration, vanilla/Lit/Web Awesome fixtures |
| 5: Production | Build-time envelope/config/manifest/CSS, non-minified modern output, no-framework-JS unenhanced routes, source-independent Node deployment, production-browser measurements |
| 6: Distribution | Separate workspace packages, compiled exports/declarations/CLI/assets/docs, independent starter, strict clean-consumer gate, CI and consolidated migrations |

Core source stays in `src/framework` and the example remains at the private repository root. `packages/lithono` builds from that source; this avoids moving existing working-tree edits while separating the publishable dependency/export contract. The starter lives in `packages/create-lithono/template`. Applications consume compiled package exports rather than framework-source aliases.

## Verification

Local primary environment: Linux, Node 26.2.0, pnpm 11.9.0, TypeScript 5.9.3, Vite 8.2.2 in the repository, Chromium 156.0.8078.4. The clean consumer independently resolved Vite 8.3.4. Lit 3.3.3, SSR 4.1.0, SSR client 1.1.8, and context 1.1.6 form the tested hydration combination.

| Gate | Result |
| --- | --- |
| Root and all four fixture typechecks (`pnpm test:types`) | Passed |
| ESLint (`pnpm lint`) | Passed with existing/adopted `no-explicit-any` warnings, no errors |
| Compiler CLI (`pnpm check`) | 18 templates and 19 TypeScript modules passed |
| Node/HTTP/compiler suite (`pnpm test:node`) | 69 passed, no skipped tests |
| Ownership/state Chromium suite | 6 passed |
| Forms Chromium suite | 7 passed |
| Interoperability Chromium suite | 3 passed (including follow-up catalog/ordinary-import coverage) |
| Copied production Chromium suite | 6 passed |
| Example client/server production build | Passed |
| Clean packed-package consumer | Passed: install, strict types without aliases or skipLibCheck, Locals augmentation, CLI generation/check, client/server build, native ESM imports, Node SSR, Chromium hydration |
| Minimum Node 22.13.0 | Node suite and packed-consumer build/runtime/Chromium gate passed |

The Chromium suites now comprise 22 tests, including JavaScript-disabled behavior, direct URL/refresh and Back/Forward restoration, multiple subscribers, preservation of focus/drafts/keyed component state, refresh races, and reconciliation after out-of-order server mutation completion. Follow-up interoperability coverage proves unused catalog entries are not requested and normal trio imports work without mappings. The packed consumer supplies an additional real-browser hydration check.

Public identity callbacks are grouped under `createLithonoApp({ auth: { publicUser, publicSession } })`; the updated migration guide explains their authentication context and server/browser boundary.

The package gate creates tarballs under `/tmp/opencode/lithono-package-*`, scaffolds an external application from the packed generator, and installs the packed framework without Better Auth or Anime.js. It requires no framework checkout aliases. Latest minimum-Node gate consumer: `/tmp/opencode/lithono-package-WEyMaf/app`.

CI is configured in `.github/workflows/ci.yml` for Node 22.13 and 24. It runs typechecking, lint, compiler checks, Node tests, builds, browser tests, and the clean package gate. Remote GitHub execution has not been performed in this session.

## Production measurements

See [Phase 5 production](phase5-production.md) for methodology and the initial raw measurement record. The fixture was rerun after packaging integration and still delivered zero framework scripts on the static route. The interactive route's local first-load and click measurements are functional observations on loopback HTTP without throttling, not a broad speed claim or INP benchmark.

## Supported alpha scope

- Node buffered SSR and file-based routes/nested layouts.
- Lit-first trios and ordinary JavaScript/Lit component modules.
- Native forms/navigation, enhanced actions and same-route refreshes.
- Optional typed URL-backed view state shared by loaders and subscribing components.
- Readable modern framework JS/CSS with source maps and inspectable compilation.
- Per-component external SSR/client-only registration.
- Compiled package and independent minimal starter.

## Explicit limitations

- Cloudflare/non-Node adapters and explicit prerendering are rejected as unsupported.
- SSR is buffered; progressive streaming and critical-CSS extraction are not implemented.
- Readable Lit uses readable development modules and retains their diagnostic work. Already-minified third-party modules cannot be reconstructed automatically.
- Light-DOM hydration includes a small version-sensitive compatibility adapter. Lit is pinned to the tested peer version for this alpha.
- Browser verification is Chromium, not Firefox/WebKit certification.
- Web Awesome coverage is browser-only `wa-button` 3.0.0, not library-wide SSR or all form controls.
- URL state is opt-in. Share one instance for cross-component coordination; independent instances do not observe each other's local history writes. Local presentation updates require enough existing data. Refresh errors are exposed through the callback/events rather than a mandatory global pending-state store.
- Arbitrary raw action Responses have transport-dependent decoded types; application callers should choose a predictable action return convention rather than assume every Response becomes JSON.
- The real development demo's authenticated signup, listing mutations, sign-out and sign-in are now verified. The copied-production check still covers public documents, not authenticated mutations. Deployment needs its appropriate Better Auth schema setup and configuration; development verification uses the demo's configured migration option.
- Existing external applications still need the documented migration and their own integration verification.

## Migration and reference

- [Consolidated migration guide](MIGRATION_ALPHA.md)
- [URL view state](url-state.md)
- [DOM ownership and render-state contract](phase2-dom-state.md)
- [Component registration and interoperability](phase4-components-migration.md)
- [Production deployment](phase5-production.md)
- [Action wire protocol](../../src/framework/action-protocol.md)

The packed framework includes these docs under `dist/docs`; repository-relative implementation links in phase reports refer to the source checkout.
