# Documentation authoring

Published articles live in `content/docs/*.md`; local plans live in ignored `plans/`.
Engineering verification records remain tracked in `reference/engineering/`.

## Add an article

Use a lowercase hyphenated filename and YAML frontmatter with `title`, `description`,
and one of the sections in `tools/documentation.ts`. Add the article ID to that file's
explicit `documentationOrder`. The page provides h1; article headings begin at h2.

Use normal Markdown, GFM tables, and blockquotes for notes. Raw author HTML is disabled.
Code fences accept TypeScript, JavaScript, HTML, CSS, shell, JSON, Markdown, and text.
Optional metadata: `title="src/pages/example/page.ts"`.

Source-backed fences can use `source="src/pages/bookstore/.../page.ts"` or a path
under the explicit example allowlist. The pipeline embeds the real file in both HTML
and the downloadable Markdown. Add focused source roots to the allowlist deliberately;
never expose arbitrary request-supplied paths.

Link articles as `/docs/article-id` and headings as `/docs/article-id#heading-id`.
Duplicate headings get stable numeric suffixes. Broken article/heading links and
unknown code languages fail content compilation. Keep aliases when renaming a public URL.

## Delivery

The Vite plugin parses Markdown with remark, renders with rehype, and highlights with
server-only Shiki. Generated content is embedded into the SSR build, so production
does not read the Markdown source tree. Development watches articles and included sources.

`/docs` provides server-side search. `/documentation/article-id.md` and `/llms.txt`
are generated from the same article set. The article component uses `unsafeHTML`
only for this compiled repository-authored content.

The light-DOM `docs-code` element enhances server-owned code markup with copying.
It never re-highlights or reconstructs the code in the browser. Theme selection
uses root data attributes and shared CSS variables, including dual syntax palettes.

## Verification

- `pnpm test:docs`: metadata, internal links, heading IDs, source inclusion, escaped
  code, content-depth smoke checks, and compiler HTML insertion behavior.
- `pnpm test:docs:checkpoints`: independently packed/generated starter overlays,
  strict declarations, template/domain checks, builds, Node SSR, native/enhanced/reduced-
  motion browser flows, and copied final deployment with authenticated access.
- `pnpm test:docs:site`: after building, verify every HTML/Markdown/llms entry, source
  expansion, copy controls, retained shell, all-article mobile layout, and native search.
- `pnpm test:docs:completion`: sequential combined gate for docs, all eight packed
  examples, app checks/build, targeted development/production browsers, and site checks.
- `pnpm test:demos`: actual application browser suite, including docs and bookstore.
- `pnpm test:demos:production`: equivalent production application checks.
- `pnpm test:tailwind`: independent packed consumer with Tailwind.
- `pnpm test:types`, `pnpm check`, `pnpm lint`, and `pnpm build`.

Comparison pages identify their framework variants and link official sources. Review
those sources when updating external framework examples. Source-backed examples are
executable application files; illustrative external-framework snippets are not certified
as independent projects by the Lithono suite.

New application examples use `@/` imports rooted at `src/` and explicit `data.*`
access for page/layout loader values. Loop item variables and component fields keep
their own scope. The starter supplies the matching TypeScript path mapping; Vite's
framework plugin supplies runtime/build alias resolution.

## Checkpoint authoring and release maintenance

The public-export audit and dedicated route/class/controller/context/form/navigation/
server/auth/animation references are recorded in
`reference/engineering/public-api-documentation-audit.md`. The connected tutorial and
executable lifecycle milestone is recorded in
`reference/engineering/documentation-completion-verification.md`.

`examples/docs/projects.json` declares ordered source overlays and runtime dependencies.
`tools/docs-project.mjs` generates each checkpoint from packed artifacts, installs its
dependencies, and supplies test scripts/types. Keep complete source files in overlays;
source-backed article fences should show those exact files and name the generated-app
destination. Say explicitly when a fence is only an excerpt or a larger showcase file.

Eight projects are now verified, including five connected bookstore stages and a
controller/context/form/navigation/auth/animation lifecycle app. Broader arbitrary
snippet extraction remains future enhancement; do not claim every illustrative fence
or external-framework comparison is independently built.
Chapter House currently implements catalog/receiving/publication, not checkout,
sales reservations, customer management, or shipping. Those are subsequent workflows.
