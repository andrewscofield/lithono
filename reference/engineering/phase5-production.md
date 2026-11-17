# Phase 5: production contract and verification

## Implemented contract

- **Node SSR is the supported deployment path.** `cloudflare()` is an experimental placeholder; configuration rejects Cloudflare and other non-Node adapters explicitly. `prerender: true` throws during route discovery/startup. Static routes are no longer labelled automatically prerendered. No placeholder prerender manifest is emitted by new builds; the exact obsolete empty scaffold from earlier builds is removed on rebuild (unknown/user-authored contents are preserved).
- **SSR is buffered.** Loaders run, Lit's result is collected, tags/styles/modules are determined, and then the document writer sends the response. `streamPageResponse()` is a chunked response writer, not progressive rendering, early head flushing, or time-to-first-loader-result streaming.
- **Production documents are built, not read from source on requests.** The client build emits hashed CSS/JS and a manifest. The SSR build embeds the app envelope, configured inline policy, client manifest and processed CSS text in its generated `server/production` module. Production startup/request handling does not load `lithono.config.ts`, Vite, source HTML/CSS, or a disk manifest. Missing build inputs/assets fail explicitly instead of falling back to development URLs.
- **Build order matters:** use `lithonoViteConfig()` and `vite build` (client then SSR), rather than deploying an SSR-only build with no matching client output. Deploy the matching `dist/client` and `dist/server` together and rebuild after changing configuration, CSS, or the envelope.
- **No-framework-JS routes:** when the route/layouts do not need enhancement and no interactive/client-only element modules are selected, omit the JSON payload, bootstrap, module scripts and modulepreloads. SSR templates, loaders, native links/forms and CSS still work. `hydrate: false` on a page does not suppress an interactive child; an SSR component explicitly declaring `static hydrate = false` is not selected for enhancement. Browser-only elements still load.

## CSS policy and migration

```ts
export default defineConfig({ adapter: node(), inline: 'styles' });
```

| Policy | Route-managed CSS |
| --- | --- |
| `styles` (new default) | Inline complete route stylesheets once, without also linking them |
| `none` | Link hashed built stylesheets, without inlining them |
| `critical`, `all` | Compatibility aliases for `styles` |

There is **no critical-CSS extraction**. Existing `inline: 'critical'` settings remain valid but now mean whole-sheet inlining without the previous duplicate stylesheet link. Prefer the descriptive `styles` name in new configuration.

Sibling trio stylesheet imports are owned by the route document in production, so Vite's dynamic-import CSS helper cannot fetch another full copy after enhancement. The built-in animation element also declares its sibling stylesheet ownership. Ordinary JS/dependency CSS imports remain **linked once**, even with `styles`: the document's link is recognized by Vite's helper and prevents another request. This exception preserves ordinary imported CSS behavior without double delivery.

CSS entries under `src/**/*.css` are processed by Vite at build time, including relative imports and asset URL rewriting. The production fixture verifies a nested CSS import and a hashed SVG URL outside the source checkout. Route stylesheet metadata must identify built CSS; an unbuilt path is an error. The envelope is a cached HTML envelope, not a second Vite HTML entry: use deployable public/hashed URLs for assets authored directly in `app.html`.

## Readable output and source maps

`lithonoViteConfig()` enforces `minify: false`, `cssMinify: false`, JS source maps and readable internal exports through inline build overrides. The target is ES2022. Vite still parses, transforms, tree-shakes and splits modules; this is readable compiled output, not verbatim authored source.

Lit ships already-minified default browser modules. Only the following tested Lit packages select their published readable development trees: `lit`, `lit-html`, `lit-element`, `@lit/reactive-element`, `@lit/context`, and `@lit-labs/ssr-client`. Hydration support must use the matching readable tree: mixing readable Lit with the minified SSR-client hook can leave server buttons unenhanced. The resolver does **not** set a global `development` export condition or change the production mode/environment of unrelated dependencies. A conditional-export regression test checks this.

These readable Lit modules include development checks/warnings and increase payload size. Other dependencies may already publish minified code or shortened names; disabling the bundler minifier cannot reconstruct their original names. Server npm dependencies remain external and retain their published output. This is not a universal dependency de-minification guarantee.

JS maps retain the compiler's HTML/TS mappings; the full Node suite checks exact mapped template/fragment positions and emitted HTML/TS sources. Generated discovery scaffolding has no authored-source mappings rather than inventing positions in the original filesystem discovery implementation. Vite's CSS build does not provide the same emitted external CSS-map contract. JS maps include `sourcesContent`; runtime source independence means requests do not need those source files, not that source text is absent from source maps.

## Reproducible copied deployments

```sh
pnpm test:node
pnpm typecheck
pnpm exec tsc --noEmit -p tests/phase5-production/tsconfig.json
pnpm test:phase2:browser
pnpm test:phase4:browser
pnpm test:phase4:interop
pnpm test:phase5:browser
```

The Phase 5 Playwright webservers build both the reusable fixture and the actual example application. `tests/phase5-production/deploy.mjs` copies **only `dist`**, writes a small ESM runtime package manifest, independently installs npm dependencies with `--omit=dev`, deletes the copied client disk manifest, asserts there is no root `src` directory, and starts the copied server with its deployment directory as CWD. There are no source or `node_modules` symlinks back to the checkout. Servers stop when Playwright exits; the temporary deployment directories remain available for inspection.

Verification on 2026-10-10:

| Check | Exact result |
| --- | --- |
| Full Node suite | 69 passed, 0 failed (3.532 s) |
| Phase 2 Chromium | 4 passed (2.7 s) |
| Phase 4 forms Chromium | 7 passed (4.5 s) |
| Phase 4 interoperability Chromium | 2 passed (3.2 s) |
| Phase 5 copied-production Chromium | 6 passed (14.2 s, includes build/install/start; final targeted rerun) |
| Root, production, Phase 2, Phase 4 forms and interop typechecks | Passed |
| Example and fixture client + SSR builds | Passed, including final builds run by deployment tests |

Final copied fixture: `/tmp/opencode/lithono-phase5-BfOcMS`.
Final copied example: `/tmp/opencode/lithono-phase5-ubhOjX`.
Runtime: Node **26.2.0**; Chromium **156.0.8078.4**, headless Linux.

Independently installed direct runtime dependencies:

| Dependency | Installed version | Deployment |
| --- | --- | --- |
| `@hono/node-server` | 2.1.4 | Both |
| `hono` | 4.13.13 | Both |
| `lit` | 3.3.3 | Both |
| `@lit/context` | 1.1.6 | Both |
| `@lit-labs/ssr` | 4.1.0 | Both |
| `@lit-labs/ssr-client` | 1.1.8 | Both |
| `zod` | 4.6.5 | Both (currently imported by framework fields) |
| `animejs` | 4.5.0 | Example |
| `better-auth` | 1.7.7 | Example |

npm also installs their transitive dependencies. Vite, tsx, TypeScript, the compiler parser dependencies, and editor tools were not installed in these deployment packages. These versions are the observed independent range resolution, not a claim that the workspace lockfile was used by npm. npm reported a transitive `node-domexception` deprecation.

The actual example's `/listings` SSR and `/login` document returned 200. Its fresh `.data/app.sqlite` was created in the deployment directory. **Better Auth reported missing `user`, `session`, `account`, and `verification` tables** on this fresh database. Existing auth/database application code was preserved. Authenticated flows are not covered by this smoke test: run the application's Better Auth schema migration and configure its deployed origin/secret before exercising those flows. Do not infer fully migrated authentication from the public-page smoke test.

## Actual production measurements

Measured against the copied fixture, loopback HTTP, fresh Playwright browser context, no network/CPU throttling, normal headless Chromium. This is one local functional run, not a representative performance benchmark, throughput test, browser compatibility matrix, or production-network estimate.

Static route: **0 script requests**, no framework JSON payload, no bootstrap/preload tags; built CSS, static SSR component content and hashed SVG all verified. Repeated HTTP requests also succeeded with the copied manifest removed.

Interactive route, first navigation:

| Browser navigation timing | Milliseconds |
| --- | ---: |
| Response start | 5.2 |
| DOMContentLoaded event end | 19.6 |
| Load event end | 19.6 |
| Enhancement observed after test's readiness checks | 53.2 |

The `enhancedReadyMs` field in the attached JSON is a **sampled upper bound** taken after Playwright's definition/visibility/CSS checks and `updateComplete`; it is not a precise browser-only hydration duration. Navigation timing values come directly from `PerformanceNavigationTiming`.

Five JS resource requests: **168,965 decoded bytes**, **170,465 resource transfer bytes** (including reported transfer overhead). The test server did not compress these responses. Resource timings include bootstrap, runtime, counter, Lit and shared framework code; these byte totals exclude document, image, maps and npm dependencies. The route's managed CSS made **0 stylesheet requests**, including after enhancement.

Ten actual Playwright pointer clicks each changed the counter and preserved functioning enhancement. Durations measured **inside Chromium**, from the capturing click listener to Lit `updateComplete` plus the next animation frame; IPC and assertion polling are outside that interval. This is neither INP nor an end-to-end network action measurement.

Raw milliseconds: `12.6, 13.2, 12.9, 13.7, 13.5, 15.0, 13.9, 15.2, 15.1, 15.1`.
Mean **14.02 ms**, median **13.8 ms**, range **12.6–15.2 ms**. The animation-frame boundary contributes substantially to these values. Raw navigation/resource/interaction JSON is attached to the Playwright result as `production-measurements.json`.

Additional production browser checks cover linked CSS, both compatibility aliases, ordinary JS-imported CSS without duplicate delivery, SSR with JavaScript disabled, and absence of page errors in the enhanced fixture/example smoke paths.

## Scope and next migration step

Source-independent runtime deployment still requires npm runtime dependencies and application state/migrations. Only the tested Node/Chromium environment is evidenced here; Firefox, WebKit, other Node versions, edge runtimes, authenticated example flows and load testing have not been established by Phase 5. Prerendering, critical extraction and progressive SSR remain unsupported.

This reusable fixture is preparation for Phase 6. It currently imports the framework's Vite helper from the checkout **at build time**. Installing a packed/public framework package into a clean consumer, validating published exports/declarations/assets, and splitting application/framework dependencies are Phase 6 work. No package/workspace restructure was made in this phase.
