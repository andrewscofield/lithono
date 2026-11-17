---
title: Lithono compared
description: Compare application models and translate familiar tasks without assuming identical APIs or capabilities.
section: Coming from…
---

Lithono, Next.js, TanStack Start, and SvelteKit can all render HTML on a server and add browser interaction. The useful comparison is how they divide responsibilities, move data, update UI, and organize application code.

This overview covers the Next.js App Router, the React integration of TanStack Start, and modern Svelte/SvelteKit. The linked guides were reviewed against their official documentation in October 2026. External APIs evolve; check the source framework's version when adapting an existing application.

## Compare the mental models

| Concern | Next.js App Router | TanStack Start / React | SvelteKit | Lithono |
| --- | --- | --- | --- | --- |
| UI authoring | React/JSX | React/JSX | Svelte components | HTML trios, Lit, ordinary web components |
| Server data | Server Components and server-side services | Route loaders using server functions where required | Server and universal load functions | Server page/layout loaders |
| Mutations | Server Functions/Actions or route handlers | Server functions and server routes | Form actions and other server APIs | Named validated actions and native forms |
| Browser interaction | React Client Components | React components/hooks | Svelte reactive components | Lit or ordinary custom elements |
| Navigation | App Router and RSC integration | TanStack Router | SvelteKit router | Shared router adopting server HTML, plus loader projections for hydrated same-page refreshes |
| CSS isolation | Explicit tools such as CSS Modules | Explicit styling tools | Compiled component-style scoping | Ordinary cascade in light DOM; shadow DOM for encapsulation |

These are orientation points, not exhaustive capability statements. Each framework offers additional APIs and integrations.

## Translate the task, not the function name

“Load a book” maps naturally to a loader, but caching, serialization, and invalidation behavior may differ. “Refresh after saving” needs a clear model of what owns the server snapshot and what owns the user's unfinished draft.

Lithono's recurring pattern is:

1. A server loader returns a serializable view projection.
2. HTML presents it using normal document semantics.
3. A validated action performs a mutation.
4. Refreshed loader snapshots reconcile with their owners.
5. Components retain responsibility for temporary interaction state.

## Similarities are useful

Progressively enhanced forms are not unique to Lithono. SvelteKit has a strong native-form story, and Next.js and TanStack Start also support server-backed form patterns.

Likewise, all of these ecosystems can use ordinary CSS. Lithono's distinction is its chosen composition of HTML authoring, web components, light-DOM-first design, explicit server contracts, and readable output—not a claim that other frameworks cannot use the web platform.

## Current tradeoffs

The Lithono alpha supports buffered Node SSR. It does not currently provide progressive SSR streaming, implemented Cloudflare deployment, or prerendering. It has a younger ecosystem and narrower browser certification than established frameworks.

Choose it when you value a web-component application model and want to participate in an evolving alpha. Account for the current supported scope when choosing it for a production project.

## Follow your starting point

- [Coming from Next.js](/docs/from-nextjs): server/client boundaries, forms, navigation, refresh.
- [Coming from TanStack Start](/docs/from-tanstack-start): loaders, server functions, URL state, caches.
- [Coming from SvelteKit](/docs/from-sveltekit): server loads, forms, reactivity, component styling.

The [first-page guide](/docs/first-page) runs in a clean Lithono starter. The [bookstore guide](/docs/bookstore) shows how the pieces form a connected application.
