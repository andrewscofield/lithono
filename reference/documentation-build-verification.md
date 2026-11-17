# Documentation and Chapter House — first implementation milestone

Verified locally on 2026-10-15 with Node 26.2.0, pnpm 11.9.0, and Chromium
156.0.8078.4. The existing CI matrix covers Node 22.13 and 24; those CI jobs were
not executed by this local session.

## Delivered

- 26 Markdown articles under `content/docs`, with frontmatter, GFM tables,
  section anchors, TOC, explicit navigation, source includes, and link validation.
- Persistent `/docs` shell, responsive sidebar, server search, breadcrumbs,
  adjacent-page navigation, titles/descriptions, Markdown endpoints, and `llms.txt`.
- Shared `docs-code` element for documentation and component-directory source panels.
  Shiki produces escaped highlighted HTML and both syntax palettes on the server/build
  side. The browser enhances copying and receives no highlighter/parser implementation.
- Shared Light/Dark/System preference, early document application, persistent selection,
  semantic CSS tokens, and light/dark code surfaces.
- Next.js App Router, TanStack Start React, and SvelteKit orientation/translation guides.
- CSS/cascade/design-system guidance and a verified optional Tailwind 4 integration.
- Chapter House workspace catalog creation/editing, draft publication, public shops,
  and transactional inventory receiving with version checks and replay-safe receipts.
  Repeated receiving works; successful receipt forms reset and unrelated enhanced
  catalog drafts survive a stock refresh. Draft product URLs return 404 publicly.
- Local planning/handoff files moved to ignored `plans`; public engineering records
  retained under `reference/engineering`. Package assembly uses the new directories.

## Checks

| Check | Result |
| --- | --- |
| `pnpm test:types` | All projects pass |
| `pnpm check` | 46 templates and 57 TypeScript modules pass |
| `pnpm lint` | No errors; 62 existing warnings |
| `pnpm test:node` | 84 pass, including the 5 documentation checks |
| `pnpm test:showcase` | 26 pass |
| Development actual-app cases | 44 passed in the full run, followed by both corrected bookstore cases passing in their targeted rerun |
| Final `pnpm build` + `pnpm test:demos:production` | All 46 pass |
| Fresh-cache ownership browser suite | All 6 pass |
| Native/enhanced forms browser suite | All 7 pass |
| Component interoperability browser suite | All 4 pass |
| Copied production deployments | All 7 pass, including docs and bookstore without source, authoring content, or a disk manifest |
| Packed starter/package consumer | Passes documented local-tarball `pnpm dlx` generation, strict declarations, CLI, build, Node SSR, and hydration |
| Tailwind consumer | Development and production pass with Tailwind/plugin 4.3.3, Vite 8.3.4, Lit 3.3.3 |
| Client implementation audit | No Shiki, Oniguruma, remark parser, or rehype serializer imports in emitted client JS |
| Visual review | Desktop/light and mobile/dark docs; desktop backoffice and mobile product page inspected |

The docs content watcher test checks edits, additions, and removals without restarting
the development server. Source-backed article snippets are expanded into both the HTML
and machine-readable Markdown.

The Tailwind gate verifies HTML/TypeScript class scanning, computed CSS in the initial
SSR page, explicit/system theme variants, route navigation without document replacement,
and development source changes after requesting the updated document. It does not
claim automatic Vite-client reload or arbitrary shadow-root utility injection.

## Shared defects exposed and fixed

1. Configured client-only elements could use slash-prefixed manifest identities while
   the production asset resolver searched only the trimmed identity. Resolution now
   normalizes both forms; the root theme picker and copied docs exercise the fix.
2. The development HTTP integration treated every `.md` URL as a source-module request.
   Application Markdown resources now reach Hono while source-path exclusions remain.
3. HTML templates can explicitly use the public `unsafeHTML` helper for trusted compiled
   content, including component trios. Ordinary interpolations remain escaped.
4. The synthetic ownership fixture had no scan entry and raced a second Vite dependency
   optimization on first load. It now declares its browser graph; a fresh isolated cache
   passes all ownership assertions without a retry.

Earlier package-rebuild and application checks were briefly scheduled concurrently,
which removed the workspace package output during config loading. Those checks were
rerun after packaging completed. Package builds and checks that consume that workspace
output should be scheduled sequentially.

## Scope and next milestones

This is a substantial first documentation milestone, not the complete public reference
or the completed bookstore business application. Add per-controller/context/form lifecycle
and optional authentication/animation references, independent tutorial checkpoints, and
broader extracted-snippet checks. External-framework snippets are explanatory comparisons,
not independently built external-framework projects.

The bookstore currently covers catalog, incoming stock, and publication. Sales,
reservations, customers, checkout, shipping, and storefront content management remain
subsequent workflows. Existing showcase applications remain available for larger examples.

The copied example deployment still reports its pre-existing Better Auth fresh-database
schema diagnostic; its browsing, docs, and asset checks do not establish authentication
setup in that isolated artifact. Native/enhanced account and bookstore workflows are
covered in the actual-app suites with their isolated migrated test databases.
