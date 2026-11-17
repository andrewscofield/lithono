---
title: Upgrading and verification
description: Upgrade the framework deliberately and distinguish package, database, rendering, and provider checks.
section: Guides
---

The alpha is evolving. Record the framework version, Lit version, runtime, and lockfile used by your application before upgrading.

## Upgrade a consumer application

1. Review release notes and changes to public contracts.
2. Update the installed framework package and the tested peer versions together where required.
3. Run TypeScript and `lithono check`.
4. Rebuild both server and client output.
5. Exercise initial SSR, hydration, navigation, and mutation recovery.

Do not deploy a new server with stale browser assets or retain old generated templates after a compiler update.

## Recheck navigation assumptions

`hydrate = false` controls page hydration, not participation in the shared router. Older development notes describing reading pages as automatically bootstrap-free are superseded.

Use `data-lithono-native` for an intentional native navigation/submission path. Otherwise verify application-shell persistence, Back/Forward, query refreshes, focus, and scroll behavior.

## Preserve application data

Framework upgrades and application database migrations are different operations. The showcase uses numbered, transactional migrations; it does not require deleting the database to pick up new examples.

Back up durable data and test the actual migration path. The Chapter House receiving ledger is application schema, not a table automatically installed for every Lithono consumer.

## Useful repository checks

```shell
pnpm test:types
pnpm check
pnpm test:node
pnpm test:showcase
pnpm test:docs
pnpm build
pnpm test:package
```

The actual-app browser suites also cover the showcase. Development and production demo suites own the same port, so run those sequentially.

Package-consumer checks are particularly important: workspace aliases can hide missing exports or declaration problems that an external application will encounter.

## Test what the user relies on

For inventory, assert stock, receipts, ownership, and replay behavior. For documentation, assert server-rendered code, working copying, links, navigation identity, themes, and mobile layouts.

Provider test transports prove your handling of deterministic responses. They do not prove real payments, inbox delivery, or third-party service availability.
