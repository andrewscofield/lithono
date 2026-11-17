# Lists and listings: real-application migration verification

The framework fixtures did not cover the original demo components or their actual forms/authentication data. The following integration defects were reproduced against the running example and corrected:

- Legacy component render-root overrides bypassed hydration detection, duplicating task-card and price content. Demo components now use the default light root; framework hydration detection also runs at the actual first-update boundary so standard `createRenderRoot()` overrides remain supported.
- Listing-price's browser-only `closest()` call executed during SSR. Browser event setup is guarded, and its listener subscribes to the page that dispatches enhanced-form success events. Disconnection removes the listener from the retained host.
- Form error/hint updates used `textContent`, deleting Lit's child-part boundaries. Messages now update text leaves without deleting comment/element identities, so mutation refreshes and validation-error retries remain incremental.
- Root/listings layouts and the listings loader returned the full auth user, including Date-valued fields. They now return deliberate plain public view data.
- Automatically inferred required boolean fields incorrectly required checkboxes to be checked. Boolean presence is not truth; explicit authored `required` checkboxes retain their native behavior.
- Client dependency scanning included server route scripts. The default scanner now targets browser component sources, avoiding cold-start server-boundary errors. Tests use an isolated cold cache rather than sharing the developer's running server cache.
- Blur validation could reveal an error hint and move a submit button between pointer-down and pointer-up. When focus moves to the form's submitter, validation is left to submission so the first click is retained.

## Real demo tests

```sh
pnpm test:demos
```

These tests launch the repository's actual Vite application and real routes, components, action handlers, SQLite repository, and auth integration. They use `LITHONO_DEMO_DATABASE` pointing to a fresh temporary database under `/tmp/opencode`; your `.data/app.sqlite` remains untouched. Port 4197 is used independently of your development server.

Coverage:

1. Create a list, add a task, complete/reopen it without navigation, retain node identity and an unrelated draft, open the task detail, delete the task and list, and check for duplicate markup/runtime errors.
2. Open a public listing with SSR status 200, sign up through the actual form, create a non-featured listing, apply a discount, exercise server-validation failure and retry, update price through the form, verify the success message and persisted value, delete the listing, sign out, and sign back in.
3. Read list/listing SSR and submit native task forms with JavaScript disabled.

`pnpm test:browser` and CI now include these tests; `pnpm test:types` includes their configuration/specs. The ownership fixture also exercises a light-root override directly.

Actual authenticated signup and listing mutations are now exercised rather than inferred from public-document checks. Deployment still needs its appropriate auth configuration and schema setup; these development tests use the demo's configured migration option.

## Phase 1 explorer extension

`properties.spec.ts` adds six actual-app tests, bringing this suite to ten.
Both `pnpm test:demos` and `pnpm test:demos:production` run the same workflows.
The latter uses the built Node server; both use fresh isolated databases.
Map tests run actual MapLibre with a deterministic intercepted style containing
no basemap tiles; email tests preload a test-process transport substitute for
acceptance/failure. Real service smoke checks remain separate and pending.
See the local Phase 1 handoff under ignored `plans/` for coverage, shared framework
defects corrected, configuration and exact limitations.
