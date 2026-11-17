---
title: Using Tailwind CSS
description: Add Tailwind through Vite while preserving SSR, ordinary HTML templates, and clear component boundaries.
section: Styling
---

Tailwind is optional. It generates CSS from class names in source files; it does not require React, JSX, or a particular component runtime. The integration recipe targets Tailwind 4 with its official Vite plugin.

## Install the integration

From an independent Lithono application:

```shell
pnpm add -D tailwindcss @tailwindcss/vite
```

```ts title="lithono.config.ts"
import { defineConfig, node } from 'lithono/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  adapter: node(),
  inline: 'none',
  vite: { plugins: [tailwindcss()] },
});
```

Start with linked CSS (`inline: 'none'`) so Vite serves processed development stylesheets and production uses emitted assets. This also avoids treating a source stylesheet containing Tailwind directives as ready-to-inline CSS.

## Import Tailwind once

```css title="src/pages/layout.css"
@import "tailwindcss" source("../");
```

The explicit source base is relative to this stylesheet and covers `src`. It avoids ambiguity in a workspace. Import the shared sheet through the root layout convention rather than adding a separate Tailwind import to every component.

Tailwind's Preflight is a reset. When adding Tailwind to an existing site, choose how its base layer and your existing reset coexist. Check form controls, headings, borders, and third-party elements after the change.

## Write classes in HTML or TypeScript

```html title="src/pages/page.html"
<section class="mx-auto max-w-3xl p-8">
  <h1 class="text-3xl font-bold">Chapter House inventory</h1>
  <p class="mt-4 text-slate-600">Receive books and publish your catalog.</p>
</section>
```

Use complete class strings in conditional expressions:

```html
<span class="${data.lowStock ? 'text-red-700' : 'text-green-700'}">
  ${data.stockMessage}
</span>
```

Tailwind scans source text. It cannot infer all runtime values from fragments such as `text-${color}-700`. Register additional sources when utility classes come from a workspace package or a dependency normally excluded from scanning.

## Share design tokens

```css title="Optional semantic utility mapping"
@import "tailwindcss";

@theme inline {
  --color-panel: var(--surface-panel);
  --color-content: var(--text-default);
}
```

Define `--surface-panel` and `--text-default` in your application's light/dark theme, then use utilities such as `bg-panel text-content`. Regular CSS components can consume those same underlying variables.

## Match the theme preference

For an explicit root-attribute theme contract with System fallback:

```css
@custom-variant dark {
  &:where([data-theme=dark], [data-theme=dark] *) { @slot; }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme=light]), :root:not([data-theme=light]) *) { @slot; }
  }
}
```

Use this alongside the preference behavior described in [dark mode](/docs/dark-mode). Avoid an unrelated second theme flag.

## Light DOM and shadow DOM

Global utilities style matching light-DOM content. They do not cross into shadow roots. Use inherited custom properties, exposed parts, or a component-owned stylesheet there.

Injecting Tailwind into a shadow root is a separate integration problem, including generated variable dependencies. This recipe does not certify arbitrary shadow-root utility injection or React-only component libraries.

## Consumer verification

The repository's Tailwind consumer gate installs the packaged framework into an independent generated app. It exercises source classes in HTML and TypeScript, initial server markup, development updates, production styling, dark mode, and navigation.

Run `pnpm test:tailwind` from the framework repository for that check. The ordinary documentation examples continue to use plain CSS so their core lessons do not depend on Tailwind.

The initial verified consumer used Tailwind and its Vite plugin **4.3.3**, Vite **8.3.4**, Lit **3.3.3**, and Chromium. Development source changes were checked after requesting the updated document; automatic Vite-client reload is a separate concern from utility generation.

### Official background

- [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Class detection and explicit sources](https://tailwindcss.com/docs/detecting-classes-in-source-files)
