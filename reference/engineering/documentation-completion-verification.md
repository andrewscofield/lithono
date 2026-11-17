# Connected tutorial and documentation completion verification

Verified locally with Node 22.23.1, pnpm 11.9.0, and the installed Chromium/Playwright
runner during the 2026-10-15 documentation session. CI is configured for its existing
Node 22.13.0/24 matrix; those hosted jobs were not executed locally.

## Four requested workstreams

1. **Connected tutorial:** added seven articles (overview plus database, accounts,
   editing, receiving, publishing, production) and five independent bookstore
   checkpoints. Each checkpoint starts from the actual packed generator, composes
   ordered application overlays, and installs its declared dependencies. The final
   app uses account-owned catalogs, integer USD cents, native forms, optimistic
   versions, transactional receipts, replay identity, and published-only public reads.
2. **Executable client examples:** added a lifecycle application/article covering
   all five controllers, context/decorator subscriptions, form result events,
   successful mutation/failed refresh, recovery, URL history, navigation failure,
   public session projection, client-only motion, and lifecycle cleanup/reconnect.
3. **Beginner editorial pass:** reviewed installation, first page, project structure,
   bookstore overview, routing, loaders/actions, forms, components, URL state,
   rendering, auth, receiving, and deployment. Clarified complete files versus
   excerpts/showcase dependencies, working directories, source aliases, initial
   browser availability, layout options, value ownership, field labels, and provider
   setup. Cross-linked conceptual/reference pages to runnable examples.
4. **Completion gate:** `pnpm test:docs:completion` sequentially runs documentation,
   all packed checkpoints, root type/template/lint/build checks, targeted development
   and production actual-app suites, and published-site verification. CI runs the
   corresponding constituent checks; the site check is now included there.

The article set increased from 39 to **47**. Existing public URLs remain present.

## Final completion run

`pnpm test:docs:completion` passed after the final form-error, dynamic-params, and
copied-deployment authentication checks were added.

| Check | Result |
| --- | --- |
| Documentation compilation/tests | All 5 pass, all 47 articles have valid metadata/navigation/internal links |
| `01-catalog` | Packed generation, strict declarations, templates, build, native/enabled browser pass |
| `02-delivery-preview` | Same, plus direct invalid native POST returns 400 and preserves quantity |
| `bookstore-catalog` | Database domain test, SSR USD/public filtering, reload/native/enabled browser pass |
| `bookstore-account` | Fresh DB migrations, anonymous redirect, registration/logout/login in native/enabled paths pass |
| `bookstore-editing` | Two domain tests, creation/save, stale version, cross-owner reads/writes, anonymous mutation checks pass |
| `bookstore-receiving` | Three domain tests, successive receipts, identical replay, changed details, stale token/version checks pass |
| `bookstore-publishing` | Four domain tests, public draft 404, publish/unpublish/republish, USD/stock output pass |
| Copied final deployment | Only dist/dependencies/manifest/lockfile; same persistent DB/secret; public output and existing-account login/private editor pass |
| `api-lifecycle` | Strict declarations, template/domain checks, build, native/normal/reduced-motion browser cases pass |
| Root `pnpm test:types` | All configured projects pass |
| Root `pnpm check` | 46 templates and 57 TypeScript modules pass |
| Root lint | No errors; same 62 pre-existing warnings |
| Root production build | Pass, including embedded 47-article content |
| Targeted development actual-app suite | All 8 docs/bookstore/lab cases pass |
| Targeted production actual-app suite | All 8 equivalent cases pass |
| Published-site completion | All 47 HTML/Markdown/llms entries, source expansion, copying, retained shell, all-article 390px layout, no-JS content/search pass |

Packed consumers resolved Vite 8.3.4, Lit 3.3.3, Better Auth 1.7.8, Zod 4.6.7,
anime.js 4.5.0, and bun-types 1.4.3 as applicable. Their tsconfigs retain
`skipLibCheck: false` and only the application `@/*` path mapping. Generated lockfiles
record the installed dependency set.

## Client behavior asserted

- Page-data controller and decorator observe refreshed count through an active page provider.
- Session controller/decorator receive Guest and authenticated public label projections.
- Params controller reads a real `[id]` route and root state after Back navigation.
- Actions controller commits through the state-bound action client.
- URL controller patches/revalidates, follows Back, stops on disconnect, and restarts on reconnect.
- Real invalid form input emits the host error event and error state; corrected input
  emits success and the action name.
- A deliberate post-commit loader failure retains the old snapshot and emits refresh
  failure, then explicit GET revalidation recovers the committed count.
- Failed navigation keeps the current heading/view and reports through the document event.
- Detached panel listeners do not react to their previous owner; reconnected behavior resumes.
- Motion has visible no-JS fallback, reduced-motion gating, and tracked-handle revert
  on disconnect. The declarative animation fallback remains visible under reduced motion.
- No unexpected browser page errors occur in these scenarios.

## Defects exposed during independent verification

- Better Auth's declaration union imports `bun:sqlite`. Installing broad Bun globals
  caused Vite/ImportMeta conflicts. The verified fix is development-only `bun-types`
  with **only** `bun-types/sqlite` in `compilerOptions.types`; no dependency-check skip,
  permissive shim, or framework source alias was added.
- The earlier context-decorator example narrowed an unknown provider into a typed
  consumed field, which strict Lit decorator typing rejects. Source examples and
  reference now use unknown fields and deliberate read-time assertions.
- A wrapped textarea label incorporated initial text into its accessible name in
  the native route. Tutorial forms now use explicit label `for`/textarea `id` pairs.
- Publication uses explicit selected-option attributes for correct initial native HTML.

The provider can print an initial missing-table diagnostic before the tutorial's
explicit migration hook on a fresh DB. Actual native/enhanced registration succeeds
after initialization. Deliberate API-example refresh/navigation failures also log
expected server diagnostics; these are tested recovery scenarios.

## Editorial and visual evidence

The reading path explains loader/action/repository/hydration terms, then introduces
tagged templates/decorators before advanced lifecycle code. Each new chapter names
the working directory, new checkpoint destination, environment setup, complete file
destinations, expected visible results, and recovery steps.

Mobile tutorial rendering was inspected from the site-check screenshot. All 47
articles are also checked for page-level horizontal overflow at 390px. Existing
desktop/light, mobile/dark, theme persistence, and navigation browser tests pass.

## Scope

These four documentation workstreams are implemented and have a repeatable completion
gate. Arbitrary illustrative snippets and external-framework comparisons are not all
independently built projects. Hosted CI matrix results and first-time-reader feedback
remain distinct evidence from this local verification. Application workflows beyond
catalog/receiving/publication remain separate development work.
