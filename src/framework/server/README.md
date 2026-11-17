# Lithono server

This folder is the HTTP side of Lithono: Hono routes, loaders/actions, Lit SSR, and the HTML document. It does not run in the browser.

## Files

| File | Role |
| --- | --- |
| `index.ts` | Builds the Hono app. Discovers pages, registers one handler per route, and either runs an action or SSR-renders the page. |
| `routes.ts` | Turns `src/pages/**` files into route records (`pattern`, `honoPath`, layouts, not-found/error). |
| `discover.ts` | Imports every page `.ts` and every custom-element module so routes and tags exist on the server. |
| `actions.ts` | Reads `?_action=` / form bodies, validates, calls the page `actions` map, returns a redirect/JSON or a failure for re-render. |
| `render.ts` | Runs `@lit-labs/ssr` on the Lit template tree and returns HTML chunks plus which custom element tags appeared. |
| `shell.ts` | Streams the HTML document: envelope + SSR body + `__LITHONO_DATA__` + bootstrap script. |
| `document.ts` | Loads `src/app.html`, escapes text, inlines CSS when asked, and serializes the JSON boot payload. |
| `assets.ts` | Resolves the Vite client manifest into bootstrap / module / CSS URLs for the current page. |
| `elements.ts` | Maps tag names → source modules, registers those classes with `customElements` on the server for SSR. |
| `ssr-data.ts` | `AsyncLocalStorage` so `getLithonoData()` during SSR sees this request’s loader data, not another request’s. |

App wiring lives outside this folder:

- `src/index.ts` — `createLithonoApp({ ... })` (the Lithono Hono app).
- `src/server.ts` — production Node entry: static `/assets` + `app.route('/', lithonoApp)`.

## Where a GET becomes HTML

1. **Register the route** — `createLithonoApp()` in `index.ts` calls `inner.all(route.honoPath, ...)`.
2. **Load data** — `renderRoute()` runs layout + page `loader`s.
3. **Build the Lit tree** — `buildTree()` wraps the page tag in layout tags (`index.ts`).
4. **SSR** — `renderPageTemplate()` in `render.ts` turns that tree into HTML strings.
5. **Stream the document** — `streamPageResponse()` in `shell.ts` writes `src/app.html`, splicing chunks at `<!--lithono:body-->` and JSON at `<!--lithono:data-->`.

The same pipeline in production (`pnpm exec vite build` then `pnpm serve`) is the same files, copied into `dist/server/src/`:

- `dist/server/src/framework/server/index.js` — route registration (`inner.all`)
- `dist/server/src/framework/server/render.js` — Lit SSR
- `dist/server/src/framework/server/shell.js` — `streamPageResponse`
- `dist/server/src/pages/**/page.html.js` — compiled page templates (the only extra files; they are the Lit `render()` from `page.html`)

Open those the same way you open `src/`. Names are not concatenated into one `server.js`.

## Why `dist/server` exists at all

Dev (`pnpm start` / `vite`) runs TypeScript from `src/` through Vite’s module runner. Production Node cannot import `.html` or TypeScript without that step, so the SSR build emits a **1:1 tree** (`preserveModules`) under `dist/server/src/`. npm packages stay imports (`hono`, `lit`, …). The browser never downloads this folder.

| Mode | What Node executes | HTML generation |
| --- | --- | --- |
| `vite` | `src/index.ts` via the Vite module runner | `src/framework/server/*` |
| `node dist/server/src/server.js` | `dist/server/src/server.js` (plus sibling modules) | `dist/server/src/framework/server/*` |
