# Showcase setup and foundation handoff

Phases 0–7 provide the shared foundation and all seven showcase applications.
`/lists` remains the simple shared demo; the homepage links every implemented
section. SSR currently buffers HTML; it does not progressively stream
delayed widgets. See the local Phase 1 handoff under ignored `plans/` for query,
ownership, integration lifecycle, framework fixes and verification details.

## Local setup

Use Node >=22.13 and pnpm. Install with `pnpm install`, copy `.env.example` to
`.env`, generate `BETTER_AUTH_SECRET` (`openssl rand -hex 32`), then `pnpm dev`.
The server loads `.env` from the working directory using Node's environment
loader without overriding exported settings. For production, export settings
in the service environment or supply a local `.env`, run
`pnpm build`, then `pnpm serve`. Set `BETTER_AUTH_URL` to the actual site origin.
All demos share Better Auth and its existing database/session tables.

| Setting | Behavior |
| --- | --- |
| `LITHONO_DEMO_DATABASE` | SQLite file, default `.data/app.sqlite`; tests use isolated temp files or `:memory:`. |
| `BETTER_AUTH_URL` | Auth origin; default `http://localhost:5173`. |
| `BETTER_AUTH_SECRET` | Auth signing secret; existing development fallback remains, supply a unique deployment secret. |
| `LITHONO_EDITOR_USER_IDS` | Comma-separated authenticated account IDs granted editorial access. Recommended for this demo's unverified-email signup. |
| `LITHONO_EDITOR_EMAILS` | Case-insensitive allowlist requiring the account's `emailVerified` flag to be true; an unverified signup claim is insufficient. Empty role lists deny access. |
| `RESEND_API_KEY`, `RESEND_FROM` | Both required; sender must be verified with Resend. Otherwise delivery returns `unavailable`. |
| `LITHONO_MAP_STYLE_URL` | Public MapLibre style URL including configurable tile sources; fetched only after map activation. Empty shows setup guidance and the usable list. |
| `LITHONO_MAP_ATTRIBUTION` | Public attribution required by the chosen style/tile provider; Phase 1 must display it. |
| `STRIPE_SECRET_KEY` | Only `sk_test_…` enables test Checkout; live keys are rejected as unavailable. |
| `STRIPE_PUBLISHABLE_KEY` | Optional `pk_test_…` for a future client integration; hosted Checkout does not need it. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` required for verified `/integrations/stripe/webhook` and paid booking availability. |
| `LITHONO_APP_ORIGIN` | Explicit public HTTPS or localhost HTTP origin for server-built Checkout and newsletter links; no path/query/credentials. |
| `LITHONO_DEMO_CACHE` | Optional Vite cache path used by the demo test server harness. |

Config stays in server modules. Never project provider keys or the complete
configuration into loaders, HTML, browser modules, or logs. Map style URLs and
attribution are public; use only public-scoped tile tokens. MapLibre is an
application dependency loaded dynamically in map view. Stripe booking/payment
routes are implemented in test mode; configuration is required for paid booking.

## Database and repository APIs

- `src/server/db.ts` still exports `sqlite` and the existing `db` facade. Better
  Auth and current routes keep the same connection and behavior.
- `openDatabase(path?)` in `src/server/database.ts` opens a connection, enables
  foreign keys/busy timeout, runs numbered additive migrations and seeds.
- `runMigrations(database, steps?)` records versions in `showcase_migrations`.
  Each step is a synchronous atomic transaction. Add new numbered migrations;
  never edit an applied step or replace/drop an existing database.
- `seedOnce(database, domain, scope, version, callback)` transactionally records
  seed metadata in `showcase_seeds`. Domain seeds use workspace IDs as scope and
  deterministic records. The legacy seeds have fixed timestamps and only seed
  empty tables once; deleting all records no longer reseeds them on restart.
- Future domain files live independently in `src/server/repositories/` and use
  `createDomainRepository(database: DatabaseSync)` factories. Production callers
  import `sqlite` from `../db.ts`; tests pass `openDatabase(':memory:')`. Avoid
  importing the singleton in repository factories. Use explicit columns.
- `transaction(database, callback)` supports synchronous work only; composed calls
  use savepoints. No provider awaits. Inquiry and outbox inserts commit together.

Existing records and auth data are retained. Migration 1 adds missing old listing
columns without changing prices/IDs. Migration 2 adds workspace, seed metadata,
and outbox tables. Migration 3 adds property metadata and durable inquiries;
25 additional versioned seeds preserve all existing listing IDs and values.
Migration 4 adds workspace-owned dashboard projects, metrics, milestones and
activity; its versioned two-project seed is applied independently per authenticated
workspace and preserves subsequent notes/status edits.
Migration 5 adds workshop sessions/bookings/holds/events/tokens; migration 6 adds
workspace inventory/audit; migration 7 adds community publication/preferences.
Existing lists are intentionally shared and not retroactively
assigned owners. Back up the SQLite file before deployment as normal.

## Ownership and editorial handoff

Actions for new personal domains call `requireWorkspace(ctx)`, which calls
`requireUser(ctx)` and uses that user's ID as a stable personal workspace ID.
Do not accept mutation scope from forms, URLs, or client projections. Every domain
read/write/reset query must include `workspace_id = ?`; a reset deletes only
that domain's records and seed markers in that scope, not auth/outbox/legacy data.
Workspace helpers alone do not enforce domain SQL isolation.

`createWorkspaceRepository(database).forUser(user.id)` supports isolated tests;
`assertOwner(workspaceId, user.id)` rejects another user's workspace.
`requireEditor(ctx)` requires sign-in plus an account ID in `LITHONO_EDITOR_USER_IDS`,
or a verified email in `LITHONO_EDITOR_EMAILS`; otherwise it returns 403. Publication
mutations use this check. The shared layout projects only `{ id, email, name }`.
The demo's default signup does not verify email, so provision editor access by
creating/signing into the intended account, obtaining its authenticated `user.id`,
and setting that ID in the server environment, then restarting. Email allowlisting
is appropriate only after an actual verification flow establishes `emailVerified`.
No public endpoint or form grants the role.

## Email and payment integration handoff

`getProviderConfig(env?)` exposes server-only email/payment/map availability.
Workshop payments validate server prices/holds, use real test Checkout REST and
verify raw webhook signatures. Return URLs never confirm payment. See the workshop
handoff for cleanup/reconciliation/refund attention states and Stripe CLI setup.

Email usage in an authenticated action:

```ts
const workspace = requireWorkspace(ctx);
const outbox = createEmailOutbox(sqlite);
const row = outbox.enqueue(workspace.id, `inquiry:${inquiry.id}`, {
  to: recipient, subject: 'Property inquiry', text: validatedText,
});
const delivery = await createEmailDelivery(sqlite).deliver(workspace.id, row.id);
```

Persist the business receipt first; delivery failure must not erase it. Enqueue
keys are unique within the workspace; reuse with changed content fails. Each
delivery uses the durable row ID as its Resend idempotency key and a 60-second
database lease to prevent concurrent sends. Provider fetch uses a 15-second
timeout, outside transactions. `sent` means **Resend accepted** and returned an
ID, not delivered to the recipient inbox. `unavailable` persists setup status
without consuming the provider retry budget; configure keys then retry.

Failed/ambiguous attempts use bounded exponential backoff (30 seconds to one
hour), at most eight attempts, and a 23-hour retry window from the first provider
attempt, inside Resend's 24-hour deduplication retention. `get` exposes durable
attempt/status/error/next-attempt data. Calls during a lease/backoff or after budget
exhaustion return `pending` with an inspection reason. There is no background
worker: domain actions explicitly trigger retries using this interface. After the retention window, reconcile ambiguous delivery
manually before creating a new key. No automatic retry after retention expiry.
Changing `RESEND_FROM` during a retry can conflict with provider idempotency;
keep sender configuration stable while deliveries are outstanding.

## Verification

Repeatable local checks (no credentials/network provider requests required):

```sh
pnpm typecheck
pnpm test:showcase
pnpm test:node
pnpm test:demos
pnpm build
pnpm test:demos:production
```

Foundation tests use isolated SQLite and injected clock/fetch/config. Actual demo
Playwright tests use the real routes, Better Auth, isolated database/cache, native
and enhanced actions, no-JS paths, homepage links and mobile layout. Provider
smoke checks are separate: use a verified Resend sender/controlled recipient and
record provider acceptance. Phase 1 browser tests run actual MapLibre against an
intercepted empty local style and server email transport substitutes; these are
not hosted basemap or real Resend evidence. Hosted-provider smoke checks remain
pending. Stripe Checkout browser tests use a server-only deterministic transport
and signed local webhook events, not evidence of real Stripe payment acceptance.

## Component directory (Phase 2)

`/components` and `/components/[slug]` are public, read-only catalogue routes.
No new database migration or provider configuration is required. Search uses
native GET parameters; interactive detail previews load only on activation.
See the local component-directory handoff under ignored `plans/` for the curated
source manifest, scoped compatibility evidence, ownership and verification gate.

## Project dashboard (Phase 3)

`/dashboard` requires sign-in and seeds a personal workspace. Login/signup return
to a validated same-origin relative destination. Native project/range GET searches,
status POSTs and version-checked notes work without JavaScript; enhancements retain
draft/focus across unrelated refreshes. Web Awesome controls and a delayed counter
activate explicitly. No new provider settings are needed. See the
local project-dashboard handoff under ignored `plans/` for ownership, migration
4, shared-layer fixes and exact verification results.
# Workshop booking

Implemented `/workshops` setup, Stripe CLI test-mode webhook instructions, hold
cleanup and reconciliation operations: local workshop handoff under ignored `plans/`.

Other implemented workflows include inventory, community/newsletter/editorial roles,
and documentation/lab. Local handoffs live under ignored `plans/`. Public in-app docs
start at `/docs`, with tracked Markdown under `content/docs/`.
