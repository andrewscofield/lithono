---
title: Introduction
description: Understand the pieces of a Lithono application before learning their APIs.
section: Get started
---

Lithono is a Lit-first, server-first application framework for web components. You write HTML templates, CSS stylesheets, and TypeScript modules. Lithono connects those files to routing, server data, forms, rendering, and browser enhancement.

You need basic TypeScript and familiarity with HTML forms. You do not need to know Lit, React, or a particular state-management library.

## Start with the document

A useful page begins with useful HTML. A product description, shop opening hours, or delivery policy may need no page-specific browser behavior at all:

```html title="src/pages/about/page.html"
<article>
  <h1>Visit Chapter House</h1>
  <p>An independent bookshop with a small online catalog.</p>
  <a href="/shop">Browse our books</a>
</article>
```

An HTML-only page is a valid starting point. Add a sibling `page.ts` when the page needs a loader, actions, metadata, or an explicit hydration choice. Add `page.css` when it needs its own presentation.

## The request-to-interaction path

1. A request matches a route under `src/pages`.
2. Server loaders prepare the page and layout data.
3. The server renders the HTML response, including compatible web components.
4. The browser can display the page and use ordinary links and forms.
5. When browser enhancement is selected, the shared client router enhances navigation and selected components hydrate or upgrade to add interaction. A fully static document can omit that browser bootstrap.

Current SSR is buffered: rendering completes before the response is assembled. Lithono does not currently implement progressive widget streaming or a React Server Components transport.

## Give state a clear owner

The database owns durable records. Loaders return a view of those records. The URL owns linkable filters and pagination. Components own temporary interactions such as an open panel or an unfinished draft.

For example, receiving ten books is a server mutation. Filtering the inventory by author belongs in the URL. The text staff have typed into an unsaved delivery reference belongs to the form.

Keeping those distinctions explicit makes refreshes, Back/Forward, and conflict recovery easier to reason about.

## What Lithono adds

Lithono supplies file-based routing, loader/action conventions, HTML template compilation, component discovery, SSR adoption, form enhancement, client navigation, WebMCP tool exposure, and production asset handling. These are framework mechanisms, not browser standards; the docs explain their boundaries and generated output.

Lit supplies reactive components and efficient updates. Hono supplies the HTTP application layer. Vite supplies development and production build tooling.

The result is deliberately inspectable HTML, CSS, and JavaScript. “Close to the platform” means you can understand the mechanisms, not that there is no runtime or compilation.

## Where to go next

- [Install the alpha](/docs/installation) in a fresh application.
- [Build your first page](/docs/first-page) with a small server loader.
- [Explore Chapter House](/docs/bookstore), the recurring bookstore example.
- [Build Chapter House from a starter](/docs/tutorial-bookstore), with complete files and verified checkpoints from database to deployment.
- [Expose forms, actions, and URL state to WebMCP agents](/docs/webmcp) using `lithono/webmcp`.
- [Compare application models](/docs/comparison) if you are coming from another framework.
