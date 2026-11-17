# create-lithono

Scaffold a new [Lithono](https://github.com/lithono/lithono) application.

## Usage

```sh
pnpm create lithono my-app
cd my-app
pnpm install
pnpm dev
```

## Included starter template

- `src/pages/page.html`: server-rendered home page route
- `src/components/starter-counter/starter-counter.ts`: light-DOM Lit interactive component
- `src/index.ts`: Hono and Lithono server entry point
- `src/server.ts`: Node HTTP server runner for production builds
- `lithono.config.ts`: project configuration using `lithono/config`

## Scripts in the generated project

```sh
pnpm dev        # Start development server with Vite
pnpm typecheck  # Run TypeScript checks
pnpm check      # Validate route templates and components
pnpm build      # Build client and server bundles into dist/
pnpm serve      # Run the production Node SSR server
```
