# Lithono application

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173. The page is server-rendered and the counter is progressively enhanced with Lit.

```sh
pnpm typecheck
pnpm check
pnpm build
pnpm serve
```

Deploy `dist/client` and `dist/server` with runtime npm dependencies. The supported alpha target is Node; SSR is buffered. JavaScript and CSS output remain readable.

- `src/pages/page.html`: route markup.
- `src/components/starter-counter/starter-counter.ts`: ordinary Lit component.
- `src/index.ts`: Hono/Lithono application.
- `src/server.ts`: Node listener and static assets.
- `lithono.config.ts`: configuration imported from `lithono/config`.

Add adjacent `page.ts` files for named loader/action exports and `page.css` for route styles. Generate components with `pnpm exec lithono generate my-element`.

Use `@/` for application imports: `@/lib/starter.ts` resolves to `src/lib/starter.ts`.
Lithono configures this alias for Vite in development and production; `tsconfig.json`
includes the matching mapping for TypeScript and editor navigation. The starter uses
the alias in both its server loader and browser component.

Native links and forms work without a client router. URL-state helpers are available from `lithono/url` and `lithono/client`. Authentication and animation integrations require their optional dependencies.
