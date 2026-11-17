---
title: Routing and navigation
description: Define pages and layouts, understand persistent outlets, and choose deliberate native navigation.
section: Learn Lithono
---

Routes follow the directory tree beneath `src/pages`. A `page.html` supplies the document page. A sibling `page.ts` provides its server contract.

## Define a route

```text
src/pages/
  layout.html
  page.html                       → /
  books/
    page.html                     → /books
    [slug]/
      page.ts
      page.html                   → /books/:slug
```

The dynamic value is available as `params.slug` in the loader and template scope. Validate assumptions before using parameters in database queries or domain operations.

## Add a persistent layout

```html title="src/pages/layout.html"
<header>
  <a href="/">Chapter House</a>
  <nav aria-label="Main"><a href="/books">Books</a></nav>
</header>
<main id="main-content" tabindex="-1"><slot></slot></main>
```

This is a complete minimal `layout.html`. Layouts compose from parent to child. The slot marks the page outlet managed by Lithono; `${children}` is also available in a layout template. The main target is focusable for route transitions. Do not independently replace the outlet's contents from a custom element or third-party library.

A layout loader owns its own projection. A page loader owns its page projection. Put shared identity or navigation data in the appropriate parent rather than duplicating it across every page.

## Use real links

```html
<a href="/books/the-native-web">Read about this book</a>
<a href="/books?genre=gardening">Gardening books</a>
<a href="/download/catalog.pdf" download>Download catalog</a>
```

The shared router enhances eligible same-origin links and GET forms. Common layouts persist; changed route outlets adopt server-rendered HTML. It handles navigation cancellation, titles/descriptions, loading/error feedback, focus, history, and scroll restoration.

Modified clicks, external URLs, downloads, explicit targets, and native opt-outs retain browser behavior. Links and GET forms still work with JavaScript disabled.

## Understand same-page updates

On a hydrated page, a query change can refresh loader data in place rather than replace the form or page. That is important for inventory filters and unsaved edits. Use [URL contracts](/docs/url-state) to coordinate components that share linkable view state.

Cross-route navigation fetches server HTML. Hydrated same-page refreshes use JSON loader projections. This is not an RSC payload or a new general-purpose streaming transport.

## Opt into document navigation

```html
<a href="/books" data-lithono-native>Reload the catalog document</a>
<form method="get" action="/books" data-lithono-native>
  <input name="q" type="search" />
  <button>Search</button>
</form>
```

Use this when you intentionally need native navigation. It is also useful when comparing enhanced and unenhanced behavior during debugging.

For programmatic browser navigation, import `navigate` from `lithono/client`. Prefer links when a link expresses the interaction; they preserve open-in-new-tab, copying, and accessibility behavior automatically.

## Handle missing pages and metadata

Throw `new HttpError(404, 'Book not found')` from a loader when a record is missing. Route-family not-found and error templates can provide appropriate presentation.

Export `meta` as a function returning `title` and optional `description`. It can read the loader result through its `data` argument, as shown in [your first page](/docs/first-page).

See [route contracts](/docs/reference-routes) for loader concurrency, middleware, and error handling, and [the executable lifecycle example](/docs/executable-examples#coordinate-history-and-navigation-failure) for a verified failed-navigation recovery.
