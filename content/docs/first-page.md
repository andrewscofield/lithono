---
title: Your first page
description: Start with HTML, load a fictional book, and add CSS without introducing an interactive component.
section: Get started
---

This example builds a product page in a generated application. It uses a fixture rather than a database so you can see the route contract first. The three filename-labelled fences below are complete files to create in that app. Run commands from the generated application's directory and use its printed development URL.

## Write the server loader

Create `src/pages/books/[slug]/page.ts`. A bracketed directory captures a URL parameter. The loader runs on the server and returns the values the template needs.

```ts title="src/pages/books/[slug]/page.ts"
import { HttpError, type Loader } from 'lithono';

const books = [
  { slug: 'the-native-web', title: 'The Native Web', author: 'Ada Rivers', price: 2400 },
];

export const hydrate = false;

export function loader({ params }: Loader) {
  const book = books.find(book => book.slug === params.slug);
  if (!book) throw new HttpError(404, 'Book not found');
  return { book };
}

export const meta = ({ data }: { data: ReturnType<typeof loader> }) => ({
  title: `${data.book.title} · Chapter House`,
});
```

The bookstore uses USD. Store prices as integer cents: `2400` represents `$24.00`. This avoids floating-point arithmetic in currency calculations.

## Render ordinary markup

```html title="src/pages/books/[slug]/page.html"
<article class="book-page">
  <p class="book-page__author">By ${data.book.author}</p>
  <h1>${data.book.title}</h1>
  <p>$${(data.book.price / 100).toFixed(2)}</p>
  <a href="/">Back to the shop</a>
</article>
```

`data` is the object returned by this page's loader. `${data.book.title}` is a Lithono template expression that reads its `book` property. Text expressions are escaped; book titles are not interpreted as HTML. This template becomes a Lit render function during compilation.

Use explicit `data.*` access for page and layout loader values in new templates. This makes their source clear and avoids confusing them with loop variables, component fields, or JavaScript globals. `params`, `url`, and `actions` are separate framework-provided template names.

> Older templates may use `${book.title}` as an inferred loader shorthand. It remains supported for compatibility; these docs recommend `${data.book.title}` for new route templates. Explicit access helps tooling, but does not itself enable semantic TypeScript checking of HTML expressions.

There is no click handler here because a link already does the job.

## Add a stylesheet

```css title="src/pages/books/[slug]/page.css"
.book-page {
  max-inline-size: 42rem;
  margin-inline: auto;
  padding: 2rem;
}

.book-page__author {
  color: var(--text-muted, #526370);
}
```

The adjacent stylesheet is associated with the route. Its selectors still obey the normal cascade; adjacency does not automatically scope them. See [styling](/docs/styling) for application-wide tokens and component boundaries.

## Visit and inspect

Open `/books/the-native-web`. View the response source: the title and price are already rendered on the server.

`hydrate = false` disables this page component's hydration. When another enhanced region loads the shared browser bootstrap, its router can still enhance the link and preserve the shell. A fully static document can omit bootstrap entirely. With JavaScript disabled, the link performs ordinary document navigation.

Open an unknown slug and confirm the 404 behavior. A missing record is different from an empty title or an unexpected server exception.

## Move toward a real application

The Chapter House example replaces the fixture with a database-backed catalog and exposes only published product data to customers:

```ts source="src/pages/bookstore/shop/[store]/[slug]/page.ts"
```

This last fence is a complete **showcase** file with showcase dependencies, not a replacement to paste into the clean fixture app. The pattern is the same: resolve a parameter, read a record, enforce visibility, and return a view projection. To build its dependencies step by step, use [the connected tutorial](/docs/tutorial-bookstore). Continue with [routing](/docs/routing) or [loaders and actions](/docs/loaders-actions) for the underlying concepts.
