---
title: Coming from SvelteKit
description: Build on familiar server-load and form concepts while learning web component ownership and ordinary CSS boundaries.
section: Coming from…
---

SvelteKit and Lithono share useful ideas: file-based routing, server data, HTML forms, progressive enhancement, and explicit server-only code. The biggest changes are component authoring, reactivity, style scoping, and runtime capabilities.

## Server loads have a close conceptual match

```ts title="SvelteKit — +page.server.ts (illustrative)"
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({
  book: { slug: params.slug, title: 'The Native Web' },
});
```

```ts title="Lithono — page.ts"
import type { Loader } from 'lithono';

export function loader({ params }: Loader) {
  return { book: { slug: params.slug, title: 'The Native Web' } };
}
```

Lithono's loader is server-side. SvelteKit also has universal loads in `+page.ts`/`+page.js`, with different execution and return-value rules from server loads. Do not treat those two SvelteKit modes as interchangeable when migrating.

## Templates differ, but HTML remains familiar

In Svelte, `{book.title}` is inside a Svelte component. In a Lithono page template, `${data.book.title}` explicitly reads the page's loader projection.

```html title="Lithono — page.html"
<article>
  <h1>${data.book.title}</h1>
  <a href="/books">Back to books</a>
</article>
```

Svelte's `{#each}` maps conceptually to a `lithono-each` template construct. Preserve stable record keys in either system when a row contains stateful controls.

## Native forms remain a good starting point

SvelteKit form actions and `use:enhance` provide progressive enhancement. Lithono also begins with native forms, but its action definitions, schema validation, action views, transport, and enhancement are its own contracts.

Use `actions.save.url`, `actions.save.values`, `actions.save.issue(name)`, and `actions.save.error` rather than trying to recreate SvelteKit's `fail` or action-result objects.

See [forms](/docs/forms) and the [action reference](/docs/reference-actions).

## Learn Lit incrementally

Svelte runes such as `$state` and `$derived` are compiler features. Lithono does not translate them. A Lit component has reactive properties/fields and a render function; derived display values can often be ordinary expressions or getters.

Use `connectedCallback` and `disconnectedCallback` for element lifecycle resources, calling the superclass lifecycle when extending Lit. Release subscriptions, observers, and third-party widgets on disconnect.

## CSS scoping is a real difference

Svelte compiles component styles with scoping behavior. An adjacent Lithono `.css` file does not automatically rewrite selectors for light-DOM isolation.

Use root-qualified selectors, shared tokens, and deliberate cascade organization. Choose shadow DOM where actual style encapsulation is useful. Global selectors cannot reach into another component's shadow root.

## Runtime capabilities differ

SvelteKit supports multiple deployment adapters and additional rendering modes. Lithono's current alpha supports buffered Node SSR; Cloudflare and prerendering are not implemented.

The conceptual overlap makes migration approachable, but it does not imply identical serialization, invalidation, streaming, or deployment behavior.

### Official background

- [SvelteKit loading data](https://svelte.dev/docs/kit/load)
- [SvelteKit form actions](https://svelte.dev/docs/kit/form-actions)
- [Svelte scoped styles](https://svelte.dev/docs/svelte/scoped-styles)
