---
title: Build a cohesive design system
description: Give ordinary HTML and CSS a reusable vocabulary for the backoffice, storefront, and dark mode.
section: Styling
---

A cohesive site does not require utility classes, but it does require shared decisions. Chapter House uses the same surfaces, controls, spacing, and statuses across its catalog and receiving workflow.

## Layer 1 — design tokens

```css title="Illustrative application tokens"
:root {
  --surface-page: #f5f7fa;
  --surface-panel: #ffffff;
  --text-default: #162530;
  --text-muted: #526370;
  --border-default: #dce4e9;
  --action-background: #0f6e56;
  --action-text: #ffffff;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --radius-control: 0.5rem;
}
```

Name colors by purpose. A token such as `--text-muted` can change between themes without changing every component. A token called `--gray-500` describes a palette value but not the semantic role it serves.

This repository's shared theme uses its existing `--color-*` naming. The principle is the same; applications can choose their own consistent vocabulary.

## Layer 2 — reusable patterns

```css title="Illustrative shared patterns"
.panel {
  padding: var(--space-4);
  color: var(--text-default);
  background: var(--surface-panel);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
}

.stack {
  display: grid;
  gap: var(--space-4);
}

.action {
  padding: var(--space-2) var(--space-4);
  color: var(--action-text);
  background: var(--action-background);
  border: 0;
  border-radius: var(--radius-control);
}
```

Keep this vocabulary small and purposeful. A few layout patterns do not need to become a new utility framework with every possible spacing combination.

## Layer 3 — domain presentation and behavior

A book card can be ordinary markup using the shared patterns. A stock editor becomes a component when it needs draft state and conflict handling.

Standardize semantic states: available, low stock, draft, published, pending, invalid, and conflicted. Use text and icons where useful; color alone should not carry the meaning.

## Keep storefront personality separate

The backoffice and shop can share controls and accessibility behavior while using different typography or surface treatments. Put small overrides at a deliberate root rather than copying an entire button/field system into each experience.

CSS variables inherit into shadow components, making them useful public theme hooks even when internal selectors are encapsulated.

## Review the full interaction

Check hover, focus-visible, disabled, pending, error, success, empty, and long-content states. Test narrow screens and zoom. A polished default screenshot is not enough for a staff workflow with real data.

Dark mode should be part of these tokens from the beginning. See [the theme guide](/docs/dark-mode).

## Combine with Tailwind if desired

Tailwind's theme can map utilities to the same semantic variables. That allows utility-authored layouts and ordinary component styles to share one palette and theme preference.

The choice of class syntax does not replace design decisions. See [Tailwind](/docs/tailwind) for the integration boundary.
