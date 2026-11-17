---
title: Dark mode and theming
description: Support Light, Dark, and System preferences consistently across documents, navigation, and code examples.
section: Styling
---

The documentation and showcase share semantic CSS variables. The theme control in the site header selects **Light**, **Dark**, or **System** and remembers the choice in local storage.

## Resolve the preference before paint

The document envelope reads a stored explicit preference before styles paint. It sets `data-theme="light"` or `data-theme="dark"` on the root element. System mode leaves that attribute absent so CSS media queries can follow the operating system.

The small `theme-picker` custom element updates that attribute and stores the preference. Router navigation preserves the document and its selected theme. A new document reads the same preference.

If storage is unavailable, the selection still applies for the current document. With JavaScript disabled, system-preference CSS remains available.

## Override semantic tokens

```css title="Illustrative theme contract"
:root {
  color-scheme: light;
  --surface-panel: #ffffff;
  --text-default: #162530;
}

:root[data-theme='dark'] {
  color-scheme: dark;
  --surface-panel: #17232c;
  --text-default: #edf3f7;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --surface-panel: #17232c;
    --text-default: #edf3f7;
  }
}
```

The explicit-light exclusion matters. An unconditional dark media rule can otherwise override a user's deliberate Light selection.

`color-scheme` lets browser-provided controls participate in the selected theme. It does not replace setting your own background, text, border, focus, and semantic colors.

## Highlight code without browser work

The server highlighter produces both light and dark syntax-token colors. CSS selects the appropriate values. Switching themes changes presentation immediately without parsing code or downloading a highlighter in the browser.

The code panel's surface, toolbar, border, and copy feedback also use theme variables. A single hardcoded dark panel is not a complete light/dark implementation.

## Web components and third-party UI

Custom properties inherit across shadow boundaries, but document selectors do not. Verify each third-party component's supported theme hooks; a document-level dark attribute cannot automatically restyle every shadow root.

Keep the same preference contract when adding Tailwind. Configure its dark variant to follow that contract instead of creating a separate, conflicting theme switch.

## What to verify

- Explicit Light while the operating system prefers Dark.
- Explicit Dark while the operating system prefers Light.
- System mode and live system-preference changes.
- Full reload, client navigation, and Back/Forward.
- Code, tables, inputs, statuses, and visible keyboard focus.
- Narrow-screen navigation and long source lines.

See [styling](/docs/styling) for CSS ownership and [design systems](/docs/design-system) for shared tokens.
