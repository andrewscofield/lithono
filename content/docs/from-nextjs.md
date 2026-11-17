---
title: Coming from Next.js
description: Translate App Router habits into server loaders, HTML templates, web components, and explicit refresh ownership.
section: Coming from…
---

This guide addresses the Next.js **App Router**, not the older Pages Router. The examples illustrate the architecture; database helpers stand for your application's services.

## Load a product

In an App Router application, a Server Component can read data and return JSX:

```ts title="Next.js — app/books/[slug]/page.tsx (illustrative)"
import { findBook } from '@/lib/catalog';

export default async function Page({ params }: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = await findBook(slug);
  return <h1>{book.title}</h1>;
}
```

In Lithono, put the server read in `page.ts` and the markup in `page.html`:

```ts title="Lithono — page.ts (illustrative)"
import type { Loader } from 'lithono';
import { findBook } from '@/server/catalog.ts';

export const hydrate = false;
export async function loader({ params }: Loader) {
  return { book: await findBook(params.slug) };
}
```

```html title="Lithono — page.html"
<h1>${data.book.title}</h1>
```

This is not a React Server Component rewritten with another syntax. Lithono's loader returns data for a template; its router and transport do not use the RSC payload.

## Add local interaction

Next.js uses a `'use client'` boundary for React state, handlers, and browser APIs. Client Components can still contribute server-rendered HTML on the initial request; “client” does not mean “never SSR.”

Lithono uses a Lit or ordinary custom element for interactive regions. An SSR-compatible element can render before the browser adopts it. A browser-only element needs explicit registration and fallback markup.

There is no direct `'use client'` replacement. Read [components](/docs/components) and [rendering](/docs/rendering) to choose the boundary intentionally.

## Submit a product edit

Next.js can connect a form to a server function/action. In Lithono, export a named action from the route, validate input with a Standard Schema-compatible schema, and bind the form to `actions.save.url`.

The action view exposes submitted values and validation issues. Native submission and enhanced submission use the same server operation. See [forms](/docs/forms) for the complete pattern.

## Refresh after saving

Do not mechanically replace `revalidatePath`, cache tags, or `router.refresh()` with one Lithono call. Those APIs participate in Next.js-specific caching and rendering behavior.

Lithono reconciles refreshed loader snapshots after enhanced actions. The application still decides database transactions, provider retries, cache policy, and how to preserve an unfinished client draft.

## Navigate and share filters

Use ordinary `<a href>` links. Lithono enhances eligible navigation while retaining browser behavior for modified clicks, downloads, and explicit native opt-outs.

Use GET forms and [URL query contracts](/docs/url-state) for shareable inventory filters. The framework's router preserves common layouts; a changed route outlet is different from a same-page loader refresh.

## Style and deploy

Regular CSS and Tailwind are viable approaches. Adjacent `.css` files are not CSS Modules and do not automatically isolate light-DOM selectors. See [styling](/docs/styling).

Current Lithono deployment targets buffered Node SSR. Features such as streaming, image optimization, caching infrastructure, and platform adapters require their own evaluation rather than an assumed Next.js equivalent.

### Official background

- [Next.js server and client components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js updating data](https://nextjs.org/docs/app/getting-started/updating-data)
