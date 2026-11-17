---
title: Installation
description: Create an independent application from the packaged alpha rather than copying the showcase.
section: Get started
---

Lithono currently prepares `0.1.0-alpha.1`; registry publication has not been confirmed for this checkout. Build the packages locally and use them to create an independent application. Store the generated packages in an `artifacts` directory inside your checkout.

## Requirements

- Node.js **22.13 or later**; the supported server target is Node.
- pnpm **10 or later**. This repository records its exact pnpm version in `package.json`.
- Basic TypeScript, HTML, and CSS knowledge.

The starter pins Lit to its tested version. Preserve that version while evaluating the alpha: hydration compatibility is tested against specific Lit builds.

## Build the distribution

From a checkout of the Lithono repository:

```shell
pnpm install
pnpm build:packages
mkdir -p artifacts
pnpm --filter lithono pack --pack-destination "$PWD/artifacts"
pnpm --filter create-lithono pack --pack-destination "$PWD/artifacts"
```

The commands produce two `.tgz` package files in `artifacts/`. One contains the framework, CLI, and declarations; the other contains the starter generator. `$PWD` is your current checkout directory; using it keeps the output location consistent when pnpm runs each workspace package's pack command.

## Generate your application

Still in the Lithono checkout, create a sibling application and install the local framework package:

```shell
pnpm dlx ./artifacts/create-lithono-0.1.0-alpha.1.tgz ../my-bookshop
pnpm --dir ../my-bookshop add "$PWD/artifacts/lithono-0.1.0-alpha.1.tgz"
```

The second command replaces the starter's registry dependency with your locally built package and installs the application's dependencies. You do not need to edit `package.json` by hand. The resulting folders look like this:

```text
your-projects/
  lithono/
    artifacts/
      lithono-0.1.0-alpha.1.tgz
      create-lithono-0.1.0-alpha.1.tgz
  my-bookshop/
    package.json
    src/
```

Open the generated `my-bookshop` directory in your editor. From that application's directory, start development:

```shell
pnpm dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. The starter includes a server-rendered welcome page and an interactive counter.

Application imports use `@/` for the source root—for example, `@/lib/starter.ts` refers to `src/lib/starter.ts`. Both Vite and TypeScript are configured by the framework/starter. See [project structure](/docs/project-structure#import-from-your-source-root) for the details.

> After npm publication, the intended entry point is `pnpm create lithono my-bookshop`. Until publication is confirmed, use the local distribution above.

## Check the generated project

```shell
pnpm typecheck
pnpm check
pnpm build
pnpm serve
```

`typecheck` checks TypeScript modules. `check` checks Lithono templates and component conventions. `build` emits the application. `serve` runs the production Node entry point.

For framework contributors, `pnpm test:package` performs a separate packed-consumer check, including declarations, starter generation, SSR, and browser hydration.

## Framework versus showcase dependencies

The repository's root application includes authentication, SQLite examples, maps, and provider integrations. Those are example-application choices. A generated application does not require the showcase database, Stripe, Resend, or its environment file.

Continue with [your first page](/docs/first-page), then use [project structure](/docs/project-structure) to understand where the files belong.

For a complete database/authentication workflow, follow [the connected Chapter House tutorial](/docs/tutorial-bookstore). Its checkpoint generator starts with these same packed packages and supplies all chapter files and dependencies.
