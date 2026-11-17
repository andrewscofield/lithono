---
title: Project structure
description: Know which files define routes, which register components, and which stay on the server.
section: Get started
---

A generated application is its own project. Its `src/framework` directory is not required: consumers import the installed `lithono` package.

## Application files

```text
src/
  app.html
  index.ts
  server.ts
  pages/
    layout.html
    layout.css
    books/
      [slug]/
        page.ts
        page.html
        page.css
  components/
    book-card/
      book-card.ts
      book-card.html
      book-card.css
  server/
    catalog.ts
  lib/
    catalog-query.ts
lithono.config.ts
vite.config.ts
```

This is an illustrative application tree; the generated starter begins with fewer files. `app.html` is an optional custom document envelope; the framework supplies a default when it is absent. If you add one, preserve the Lithono insertion markers for metadata, head assets, body, and serialized data.

`index.ts` creates the Hono/Lithono application. `server.ts` runs its production Node server. Configuration selects the adapter and any Vite integrations.

## Route conventions

| File | Responsibility |
| --- | --- |
| `page.html` | Page markup and template bindings |
| `page.ts` | Server loader, named actions, metadata, hydration choice |
| `page.css` | Associated page stylesheet |
| `layout.html` | Shared parent markup and its page outlet |
| `layout.ts` | Shared parent loader and hydration options |
| `layout.css` | Shared styles associated with the layout |
| `error.ts` / `not-found.ts` and templates | Route-family error presentation |

An HTML page can exist without a sibling TypeScript file. A route module without a page template is treated as a resource route rather than a document page; current resource loaders return JSON.

## Template data names

Use `data.*` to read a page or layout loader's returned object, such as `${data.book.author}`. Keep framework names such as `params`, `url`, and `actions` distinct from that object. A loop's declared item and a component's own fields have their own scope; they do not need a `data.` prefix merely because they appear in a template.

Legacy route templates may use inferred top-level loader names. New route examples should use explicit access so readers and tooling can identify where a value comes from. `pnpm check` checks syntax and conventions; this naming choice alone does not make HTML bindings semantically typechecked against loader return types.

## Import from your source root

Use `@/` for application modules. It resolves to `src/` regardless of how deeply nested the importing route is:

```ts
import { sqlite } from '@/server/db.ts';
import { createBookstore } from '@/server/repositories/bookstore.ts';
import { productSchema } from '@/lib/bookstore/product.ts';
```

The framework supplies this alias to Vite for server modules, browser modules, and dynamic imports in development and production. Package imports such as `lithono/client`, `lit`, and `@lit/context` keep their normal meaning. The production build resolves aliases into emitted module paths; the Node deployment does not need a custom alias loader.

Generated applications already include the matching TypeScript mapping. When upgrading an existing application, merge this into its compiler options:

```json title="tsconfig.json — compiler options"
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

TypeScript's mapping provides checking, completion, and editor navigation; Vite handles runtime/build resolution. Use `@/` in application source, while build-configuration files use their normal module-resolution rules before the application alias is installed.

## Recognize routes in editor tabs

Route files use predictable role names such as `page.ts` and `layout.html`. Make their tabs distinguishable by displaying the route-folder path:

```text
books/[slug]/page.html
customers/[id]/page.ts
bookstore/admin/[id]/page.css
/ · layout.html
```

The repository's Lithono editor extension offers **Lithono: Configure Route Tab Labels** in the command palette. It uses VS Code's built-in custom editor labels and writes workspace-folder settings when you run the command. Existing label rules are preserved. Named components such as `book-card.ts` keep their filenames.

Labels include all route-folder ancestors, so deeply nested dynamic routes remain distinguishable. Folder renames and new routes at configured depths are reflected automatically. Run the command again if you introduce a deeper route directory. This changes editor presentation; route filenames and URLs keep their conventions.

## Component conventions

The optional trio puts TypeScript, HTML, and CSS together. Its TypeScript file default-exports a component class; the compiler attaches the sibling template and stylesheet metadata.

Ordinary Lit and custom-element registration imports also work. A trio is an authoring convenience, not a requirement for every reusable element.

Static HTML fragments can handle repeated presentation without an independently reactive component. Use a component when it needs inputs, lifecycle, state, or behavior. See [components](/docs/components).

## Keep boundaries visible

Use `src/server` for database access, provider clients, and server services. Shared query contracts and browser-safe schemas can live in `src/lib`.

Do not import the database from a component. A page loader can call the repository and return a small serializable projection. A browser component consumes that projection and invokes supported actions when it needs to mutate records.

## This repository

The Lithono repository also contains the framework source, workspace packages, docs content, and larger showcase applications. Public articles live in `content/docs`. Personal planning material belongs in ignored `plans`. Tracked engineering records live under `reference/engineering`.

The root showcase is not the starter template. Follow [installation](/docs/installation) to test the actual consumer experience.

The [connected tutorial](/docs/tutorial-bookstore) supplies complete generated applications rather than requiring these illustrative server-module paths to exist already. Its `CHECKPOINT.md` names the source layers used for each app.
