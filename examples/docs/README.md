# Runnable documentation projects

These directories are application overlays for the packed Lithono starter.
`projects.json` is the ordered composition/dependency manifest; a layer is not a
standalone package. Later layers replace files with the same destination path.

From the repository checkout, build/pack `lithono` and `create-lithono` into
`artifacts/` as described in `/docs/installation`, then:

```sh
node tools/docs-project.mjs bookstore-catalog ../chapter-house-catalog
node tools/docs-project.mjs bookstore-publishing ../chapter-house-finished
node tools/docs-project.mjs api-lifecycle ../lifecycle-examples
```

Each destination must be new. Generation installs real packed framework exports and
chapter dependencies, keeps only the application's `@/*` path alias, and writes
`CHECKPOINT.md`. Open that generated directory to inspect all source files together.

| Project | Purpose |
| --- | --- |
| `01-catalog` | Small static-data/loader introduction |
| `02-delivery-preview` | Validated nonpersistent preview action |
| `bookstore-catalog` | SQLite connection, one-time seed, public catalog |
| `bookstore-account` | Better Auth registration/login/logout, private owner-scoped catalog |
| `bookstore-editing` | Validated drafts and optimistic edits |
| `bookstore-receiving` | Transactions, receipt tokens, stale-version handling |
| `bookstore-publishing` | Public visibility and owner-specific shops |
| `api-lifecycle` | Controllers/context, form events, refresh recovery, navigation, auth projection, motion |

Account/lifecycle apps require the variables listed in their generated `.env.example`
to be exported in the shell. See `/docs/tutorial-accounts` for commands. Production
Node does not automatically load `.env.example`. Use a stable secret and persistent
database path across restarts of the same app.

Better Auth's tested declarations import `bun:sqlite` through an optional database
union. Generated auth projects install development-only `bun-types` and load only
`bun-types/sqlite`, avoiding conflicting Bun globals. Dependency declaration checking
remains enabled. The runtime uses Node's SQLite implementation.

## Verification

```sh
pnpm test:docs:checkpoints
pnpm test:docs:checkpoints api-lifecycle
pnpm test:docs:completion
```

The checkpoint gate generates fresh isolated consumers, checks strict declarations and
templates, runs supplied domain tests, builds, and exercises native/enhanced production
browser flows. The final bookstore is copied without application source and checked
for persisted public output and authenticated editor access. The completion gate also
checks the actual docs site, all article endpoints, and targeted showcase regressions.

The core tutorial lives at `/docs/tutorial-bookstore`; advanced example explanation at
`/docs/executable-examples`. Displayed source fences point at these exact files.
