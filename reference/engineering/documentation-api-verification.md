# Documentation public-API milestone verification

Verified locally on 2026-10-15 with Node 22.23.1, pnpm 11.9.0, and Chromium through
the installed Playwright runner. CI's Node matrix was not executed locally.

## Delivered

- Audited all ten public package paths and their explicit runtime/type exports.
  Inventory and source-backed findings:
  `reference/engineering/public-api-documentation-audit.md`.
- Expanded from 26 to 39 articles: nine dedicated references for route modules,
  component/page/layout classes, controllers, contexts/decorators, form lifecycle,
  navigation/snapshots/action clients, server/plugins, auth, and animation; plus
  practical authentication, testing, debugging, and tutorial-checkpoint guides.
- Completed related action/query/config types and helper coverage, linked the new
  pages through explicit navigation, and corrected the form pending-state CSS
  example to match the controller's presence-based `aria-busy` attribute.
- Source-backed bookstore authorization and repository-test examples, expanded in
  both HTML and machine-readable Markdown. Added only the specific public test file
  to the author-time source allowlist.
- Two independent starter overlays in `examples/docs`: a static USD catalog and a
  server-validated delivery preview. The preview does not persist receipts or stock.
- `pnpm test:docs:checkpoints` builds actual packed-package consumers, not source-path
  aliases. Added to CI after the package gate, keeping package-mutating checks sequential.

## Checks executed

| Check | Result |
| --- | --- |
| `pnpm test:docs` | All 5 pass; all 39 articles compile with valid internal links/headings and metadata |
| `pnpm test:docs:checkpoints` | Both independent consumers pass strict declarations, template checks, production build, Node SSR, and enabled/disabled-JavaScript browser checks |
| Checkpoint server validation | Invalid native POST returns 400 with submitted quantity and field issue; successful native/enhanced preview redirects and survives reload |
| `pnpm test:types` | All configured TypeScript projects pass |
| `pnpm check` | 46 templates and 57 TypeScript modules pass |
| `pnpm lint` | No errors; 62 pre-existing warnings |
| `git diff --check` | Pass |
| `pnpm test:demos tests/demo-apps/documentation.spec.ts tests/demo-apps/bookstore.spec.ts tests/demo-apps/lab.spec.ts` | All 8 pass |
| `pnpm build` | Client and SSR builds pass, including embedded 39-article content |
| `pnpm test:demos:production tests/demo-apps/documentation.spec.ts tests/demo-apps/bookstore.spec.ts tests/demo-apps/lab.spec.ts` | All 8 pass |

The packed checkpoints resolved Vite 8.3.4, Lit 3.3.3, and (for the preview) Zod
4.6.7 within the documented compatible ranges. TypeScript path mappings contained
only the application-owned `@/*` mapping; framework imports resolved real declarations.

## Targeted production reference smoke

An isolated production app with a fresh database was additionally checked for:

- Successful HTML and Markdown responses for every one of the 39 articles.
- Matching headings and inclusion of every Markdown URL in `/llms.txt`.
- Expanded checkpoint sources in downloadable Markdown, with no `source=` placeholders.
- Retained docs-shell identity when navigating between new route/form reference pages.
- Enabled copy controls on the new form reference.
- No horizontal page overflow at 390px for form/server/action references and checkpoints.
- Source-backed repository tests visible on the testing guide with JavaScript disabled.
- No browser page errors during those interactions.

The one-off smoke script lives in the local temporary workspace; it is not a permanent
test suite. An initial smoke assertion selected the first shell-command fence instead
of the repository-test fence; the selector was corrected and the complete smoke rerun
passed. No application fix was needed.

## Verification boundary

This milestone changes documentation, source-example fixtures, and their verification
tooling. The new checkpoint gate covers those exact overlay files. It does not certify
all illustrative fences, external-framework projects, advanced controller/context
examples, or animation scenarios as independent applications. Existing framework tests
and the targeted actual-app cases remain the behavioral evidence for the documented
source contracts; the audit records runtime/type mismatches instead of changing them.

Existing broader package/Tailwind/copied-deployment/full-app results are historical
records in `reference/documentation-build-verification.md` and the prior handoff.
They were not all rerun for this documentation-only milestone.
