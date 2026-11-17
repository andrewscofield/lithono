---
title: Components and ownership
description: Learn the minimum Lit concepts, use ordinary custom elements, and keep DOM updates owned by one renderer.
section: Learn Lithono
---

Use HTML and CSS for presentation first. A web component is useful when a repeated UI needs inputs, local state, lifecycle, or interaction. Lithono supports Lit components and ordinary custom elements.

## The smallest Lit mental model

A Lit component is an element class with a `render()` method. Reactive properties schedule updates when they change. Lit updates the relevant bindings rather than replacing the whole document. `html` is a tagged-template helper: it creates a renderable description of markup with dynamic values. A decorator such as `@property` or `@state` registers a field with Lit's update system; `@customElement` registers the class under an HTML tag.

```ts title="An ordinary Lit component"
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('stock-badge')
export class StockBadge extends LitElement {
  @property({ type: Number }) stock = 0;

  render() {
    return html`<span>${this.stock > 0 ? `${this.stock} in stock` : 'Awaiting delivery'}</span>`;
  }
}
```

This ordinary Lit element owns a shadow root. Its registration module must be imported or configured. It does not become a light-DOM Lithono trio merely because it lives in an application.

## Use a light-DOM trio

```ts title="src/components/stock-counter/stock-counter.ts"
import { state } from 'lit/decorators.js';
import { LithonoElement } from 'lithono/client';

export default class StockCounter extends LithonoElement {
  static root = 'light' as const;
  @state() quantity = 1;
  increment = () => { this.quantity++; };
}
```

```html title="src/components/stock-counter/stock-counter.html"
<p>Delivery preview: ${quantity} copies</p>
<button type="button" @click="${increment}">Add one</button>
```

The compiler attaches the sibling template and can register the class from its filename. If you add `@customElement`, its tag must match the filename-derived tag. The CLI can generate a trio with `pnpm exec lithono generate stock-counter`.

Local state here is a preview, not durable inventory. A real receipt still requires a server action.

## Bind properties and attributes deliberately

Lit-style `.property` bindings pass JavaScript values. Attribute bindings pass serialized attribute values. Boolean `?attribute` bindings add or remove the attribute. Event `@event` bindings attach listeners.

Use a property for a structured product object. Use a string attribute for an element identifier or accessible label. See the [component directory](/components) for verified integrations.

## One owner per rendered region

The layout owns its shell. The page owns its template. A component owns its rendered light DOM or shadow root. Parent-provided content retains its composition contract.

Do not let a parent renderer, custom element, and chart library all replace the same subtree. Give a third-party widget a dedicated container and release resources when disconnected.

Use stable record keys when rendering reorderable lists. Row identity is important for focused controls and unfinished edits.

## Server-safe versus browser-only modules

A component imported during SSR must tolerate the server environment. DOM access belongs in browser lifecycle code, not unguarded top-level evaluation.

For a genuinely browser-only module, configure an element registration with `mode: 'client-only'` and render useful fallback HTML. This is how the documentation's copy controls enhance already-highlighted server markup.

See [rendering](/docs/rendering), [configuration](/docs/reference-config), and [styling](/docs/styling) for the related boundaries.

For a complete component application rather than a small illustrative snippet, run [the executable lifecycle checkpoint](/docs/executable-examples). Its actual source is typechecked and exercised for subscriptions, browser lifecycle cleanup, native fallback, and reduced motion.
