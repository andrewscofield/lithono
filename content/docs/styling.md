---
title: Styling overview
description: Use ordinary CSS deliberately, understand scoping, and choose optional tools without changing the application model.
section: Styling
---

Lithono associates stylesheets with routes and components and delivers processed CSS with server-rendered pages. Your CSS still follows browser rules.

## Start with adjacent stylesheets

`page.css`, `layout.css`, and a component trio's sibling stylesheet organize styles near their owners. A parent layout is a good place to import shared tokens and base patterns.

```css title="src/pages/layout.css"
@import '../styles/tokens.css';
@import '../styles/base.css';
@import '../styles/patterns.css';
```

A stylesheet's association determines loading; its selectors determine what it affects. A route stylesheet is not automatically scoped to that route's markup.

## Scope light-DOM rules intentionally

```css
.inventory-table {
  inline-size: 100%;
  border-collapse: collapse;
}

.inventory-table th,
.inventory-table td {
  padding: var(--space-3);
  border-block-end: 1px solid var(--border-default);
}
```

Avoid broad selectors such as `button { ... }` in a component stylesheet unless a global effect is intended. Root-qualified classes make ownership visible. Native `@scope` can also bound selectors where your target browsers support it.

During client navigation, do not rely on removing a stylesheet to undo broad global effects. Write component selectors that remain safe when application styles coexist.

## Choose actual encapsulation when needed

Shadow DOM creates a style boundary. Document-level selectors cannot style internal nodes directly. Theme custom elements through inherited CSS variables, exposed `::part` hooks, and component-owned stylesheets.

Light DOM deliberately makes document styling and composition straightforward. Neither mode is universally preferable; use the boundary that fits the component.

## Optional styling tools

| Tool | Status and role |
| --- | --- |
| Plain CSS | Default examples and shared design-token approach |
| Tailwind CSS | Optional Vite integration; see the tested recipe |
| CSS Modules | Vite has support, but trio-template binding/SSR integration is not yet a documented certified path |
| Component libraries | Verify each component's registration, styles, SSR mode, and accessibility behavior |

Do not infer support for a React component library from support for its Tailwind classes. CSS and component runtimes are separate integration questions.

## Build a cohesive system

Consistency comes from shared decisions: tokens, typography, spacing, fields, tables, statuses, and interaction states. The framework cannot infer those decisions from unrelated CSS declarations.

Follow [the design-system guide](/docs/design-system), [dark mode](/docs/dark-mode), and [Tailwind integration](/docs/tailwind) for concrete approaches.

## Production CSS policy

`inline: 'styles'` inlines whole associated sheets once. `inline: 'none'` uses stylesheet links. The names `critical` and `all` are compatibility aliases rather than critical-CSS extraction algorithms.

See [configuration](/docs/reference-config) for the complete option contract.
