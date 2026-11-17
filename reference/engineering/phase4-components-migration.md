# Phase 4: component interoperability and bootstrap resilience

## Optional external registration catalog

Declare third-party tags explicitly in `lithono.config.ts`:

```ts
import { defineConfig } from 'lithono/config';

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

Imports must register their configured tag. Package specifiers and project-root-relative modules are supported. Explicit mappings take precedence over filename discovery. Map each used tag, even when several tags share one registration import. SSR mappings load during server startup; a thrown import or missing configured registration fails startup with the tag/import identified and the original error retained as its cause. Move browser-dependent registrations to `client-only`, rather than suppressing SSR errors.

**This is a catalog, not a global client import list.** Adding a mapping does not load that module on every page. The route's rendered tags, page/layout template references, and known component dependencies determine which loaders bootstrap invokes. Unrelated entries remain lazy and are not downloaded or evaluated by that page. A tag referenced in a conditional route template can be selected even when that branch is currently hidden, so it is ready for later updates. SSR registration at server startup is a separate operation from browser delivery.

### Ordinary imports are also supported

You can import a registration module directly in a component's TypeScript/JavaScript module, including a trio, without a config mapping:

```ts
import './vendor-card.js'; // Registers <vendor-card> through customElements.define.
import { LithonoElement } from 'lithono/client';

export default class CardPanel extends LithonoElement {}
```

```html
<!-- card-panel.html -->
<vendor-card></vendor-card>
```

That import becomes an ordinary dependency of the component bundle; Lithono does not require a second tag declaration. Keep the module server-safe if it is imported during SSR. A browser-only registration can instead live in a `.client.*` component module, or be imported dynamically inside explicitly browser-only code. Config `mode: 'client-only'` is the convenient template-driven path for a package whose registration must never execute on the server.

Choose mapping-driven loading or normal imports according to your application's needs. A static import in a globally shared module still follows normal JavaScript semantics and can load globally; the framework does not silently rewrite it into per-tag lazy loading.

Client-only imports are excluded from server registration and from eager template imports. Supply meaningful light-DOM fallback children for browsers without JavaScript and during delayed/failed imports. External mappings prevent an identically named HTML fragment from being expanded in place of the external host.

## Local discovery

Component discovery includes `.ts`, `.js`, and `.mjs` under `src/components/`. Filename tags retain the existing convention (`my-card.js` → `my-card`). Browser-only local registration uses `.client.ts`, `.client.js`, or `.client.mjs`; sibling template resolution recognizes these without importing them into SSR. Use an explicit mapping when the filename differs from the registered tag or a module lives elsewhere.

## Hydration and ownership

Bootstrap installs Lit hydration support before loading registrations and uses the shared route-data cache/context root. Deferred hosts release independently when their definition becomes available. Page/layout boot state is applied before their own release. A failed import is reported with its module ID; a slow or never-resolving unrelated import cannot block healthy hosts. Bootstrap does not replace component DOM or replay arbitrary property values.

Ordinary Lit shadow elements use Lit's declarative-shadow hydration support. Lithono light elements retain the existing ownership compatibility and adopt their SSR parts. Delayed reactive property upgrades use Lit's native pre-upgrade property capture. Vanilla elements must implement their own pre-upgrade property handling if they need it.

## Tested support and limits

The actual Chromium fixture (`tests/phase4-interop/`) exercises generated Vite discovery and element graphs, Hono SSR, and **`@awesome.me/webawesome` 3.0.0** (`wa-button`, client-only). The tested stack is Lit 3.3.3, `@lit-labs/ssr` 4.1.0, `@lit-labs/ssr-client` 1.1.8, and Playwright 1.64.0/Chromium. This exact Web Awesome version is an optional application integration, installed here only as a pinned fixture development dependency. No Web Awesome runtime dependency is added to Lithono.

Coverage includes vanilla JS/MJS browser-only registrations, ordinary Lit shadow SSR/hydration, Lithono light SSR/hydration, shared page/layout boot state, delayed object-property upgrade, JavaScript-disabled fallbacks, rejected and never-resolving unrelated imports, interaction after hydration, and retained host/light-button/shadow-button/fallback node identity. Additional route tests assert that unused catalog entries are not requested and verify an ordinary registration import in a trio without a config mapping.

This verifies `wa-button` browser registration and interaction; it does not claim Web Awesome-wide SSR, form-control, or all-version support. The other Phase 4 form fixture covers native ElementInternals form-associated controls separately. Server-safe Lit components can opt into SSR; arbitrary browser-only libraries cannot be made server-safe by bootstrap. Closed shadow roots, vanilla render adoption, and automatic property replay for arbitrary custom elements are not provided. Lit ownership compatibility remains tied to the installed Lit/SSR versions and its regression suite.

```sh
pnpm test:phase4:interop
pnpm test:phase4:browser
pnpm test:phase2:browser
pnpm exec tsx --test tests/phase*.test.ts
pnpm typecheck
pnpm exec tsc --noEmit -p tests/phase4-interop/tsconfig.json
pnpm build
```
