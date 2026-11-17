---
title: Rendering and selective loading
description: Understand SSR, hydration, browser-only elements, readable output, and the shared router.
section: Learn Lithono
---

Server rendering and browser interactivity are separate responsibilities. A page can arrive as useful HTML and then enhance selected regions.

## What SSR currently means

Lithono renders compatible templates and components on the server. The current implementation buffers rendering before assembling the response; it does not progressively stream slow components.

Compatible shadow components can emit declarative shadow roots. Browser-only integrations need meaningful fallback content and explicit client registration.

## Page hydration is a choice

```ts title="A reading page"
export const hydrate = false;
```

This disables hydration of the page component. It does **not** disable the shared router or promise a zero-JavaScript document. Selected child elements may still need client definitions.

Use page hydration when bindings must respond to refreshed loader data or page-level interactions. Static reading pages can remain server-owned while a small child element adds copying or another isolated behavior.

## Hydration transfers responsibility

Hydration adopts existing server markup so the renderer can update it. It should preserve the region's ownership contract rather than invent a second owner.

A cross-route transition can replace a changed outlet. A same-page hydrated refresh should update existing bindings. These are different operations; test node identity and unsaved inputs when the distinction matters.

## Select heavy modules deliberately

A map or editor need not be loaded just because the application contains a route that uses it. Use route-specific registration or explicit dynamic imports, and provide loading/error recovery where loading can fail.

The component directory starts ordinary interactive previews automatically. Manual activation is an explicit example mode, not the required default application experience.

## Inspect browser output

Lithono preserves readable JavaScript and CSS in production. You can inspect emitted modules and source maps rather than treating minified bundles as the only supported output.

The build also writes compiler inspection material under `dist/inspect`. Distinguish generated template code before Vite resolution from the actual browser module loaded by a running application.

Readable output does not mean every source file is copied unchanged. TypeScript is compiled, templates become render functions, imports are resolved, and server-only code is separated.

## Documentation code blocks

The docs compile Markdown and highlight code on the server/build side. The response includes the language, filename, and highlighted code. A small `docs-code` custom element adds copying without re-rendering that code.

The browser receives both light and dark syntax colors as CSS variables. It never downloads Shiki to highlight an article.

See [the lab](/lab) for ownership and loading experiments, and [deployment](/docs/deployment) for output packaging.
