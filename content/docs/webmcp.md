---
title: WebMCP and AI agent tools
description: Expose forms, server actions, URL query contracts, and Lit component methods to browser AI agents through the W3C WebMCP API.
section: Guides
---

Lithono integrates with the W3C WebMCP (`navigator.modelContext`) specification through the `lithono/webmcp` entry point as well as built-in support across forms, server actions, URL state, and Lit components. Instead of authoring duplicate tool schemas by hand, you can derive descriptions and JSON Schemas directly from your existing Standard Schemas, HTML forms, and `defineQuery` contracts.

If `navigator.modelContext` is not provided natively by the browser, Lithono installs a lightweight inspection polyfill and exposes active tools, declarative forms, and execution helpers on `window.__LITHONO_WEBMCP__`.

## Why WebMCP fits Lithono

Lithono already models applications around explicit contracts:

- **Forms and Standard Schemas**: Server actions declare Zod or other Standard Schema inputs once. Lithono derives JSON Schemas, HTML5 validation constraints, and `toolparamdescription` metadata from that single definition.
- **URL query contracts**: `defineQuery(...)` from `lithono/url` supports optional field descriptions and exports JSON Schema directly via `toJsonSchema()`.
- **Component lifecycle**: Reactive controllers register and clean up imperative component tools automatically when elements connect and disconnect across client navigation.

Because client tools still execute against your route actions and DOM controls, your server loaders and action handlers remain the authoritative boundary for authentication, authorization, and business rules.

## Declarative forms and SubmitEvent bridging

When `FormSubmitController` enhances a `?_action=...` form inside a `LithonoPage` or `LithonoLayout`, it stamps WebMCP declarative attributes onto the `<form>` and its controls when not already authored:

| Attribute | Source / behavior |
| --- | --- |
| `toolname` | Action name, with `_key` or numeric suffix when repeated |
| `tooldescription` | `.mcp({ description })`, `.describe()`, or schema text |
| `toolautosubmit` | Added when `autosubmit: true` and no password field exists |
| `toolparamdescription` | Derived from schema `.describe()` or `mcpParam(...)` |

To opt an individual `<form>` out of declarative WebMCP attributes, add `data-mcp="false"`. For standalone `<form>` elements or explicit overrides in HTML templates, import `mcpForm` and `mcpParam` from `lithono` (or `lithono/webmcp`):

```ts title="src/components/search-form/search-form.ts"
import { html, LithonoElement } from 'lithono/client';
import { mcpForm, mcpParam } from 'lithono/webmcp';

export default class SearchForm extends LithonoElement {
  render() {
    const formAttrs = mcpForm({
      name: 'search_catalog',
      description: 'Search bookstore titles by keyword',
      autosubmit: true,
    });
    const queryParam = mcpParam('Keyword query or ISBN');

    return html`
      <form
        method="get"
        action="/bookstore"
        toolname=${formAttrs.toolname}
        tooldescription=${formAttrs.tooldescription}
        ?toolautosubmit=${'toolautosubmit' in formAttrs}
      >
        <input
          name="q"
          toolparamdescription=${queryParam.toolparamdescription}
        >
        <button type="submit">Search</button>
      </form>
    `;
  }
}
```

When a browser agent submits a declarative form (`SubmitEvent.agentInvoked` or `SubmitEvent.respondWith` is present), `FormSubmitController` prevents full-page reload, executes the action request, updates DOM validation and status regions, skips interactive `data-confirm` prompts if `toolautosubmit` is set, and resolves `SubmitEvent.respondWith(...)` with a `LithonoFormAgentResponse`:

```ts
export interface LithonoFormAgentResponse {
  ok: boolean;
  action: string;
  result?: unknown;
  error?: string;
  issues?: unknown;
  status?: number;
}
```

## Server actions as imperative tools

When `LithonoPage` mounts with hydrated client code, it automatically registers active route `actions` with `navigator.modelContext` (and unregisters them on navigation or disconnect). You can refine action tool metadata with `.describe(...)` and `.mcp(...)` in your route's `page.ts`, and add parameter descriptions via Zod `.describe(...)`:

```ts title="src/pages/inventory/page.ts"
import { post } from 'lithono';
import { z } from 'zod';

const adjustSchema = z
  .object({
    id: z.string().min(1).describe('Inventory item ID'),
    stock: z.coerce.number().int().min(0).describe('Updated quantity'),
    reason: z.string().trim().min(1).describe('Audit reason'),
  })
  .describe('Adjust stock quantity for an inventory item');

export const actions = {
  adjust: post(adjustSchema, ctx => {
    return { saved: true, id: ctx.input.id, stock: ctx.input.stock };
  }).mcp({
    name: 'adjust_inventory',
    description: 'Adjust stock quantity for an inventory item',
    annotations: { idempotentHint: true },
  }),
};
```

Lithono applies conservative defaults automatically based on HTTP verb and schema inspection:

- `get` actions receive `{ readOnlyHint: true }`.
- `destroy` (`DELETE`) actions receive `{ destructiveHint: true }`.
- Actions whose schema includes a password field receive `{ consequentialHint: true }` and force `autosubmit: false`.
- Pass `.mcp(false)` (or `.mcp({ enabled: false })`) on an action to exclude it from both imperative WebMCP registration and declarative form stamping.
- Export `mcp` on a page module (`export const mcp = false`, or `{ prefix, actions, forms, enabled }`) to control WebMCP behavior for the whole route. See [actions reference](/docs/reference-actions).

## URL query state as a tool

You can attach a description to `defineQuery` and its codecs in `lithono/url`, then enable `mcp` on `createUrlState` or `UrlController` to expose typed URL filtering, sorting, and pagination to agents:

```ts title="src/lib/catalog-query.ts"
import { defineQuery, query } from 'lithono/url';

export const catalogQuery = defineQuery(
  {
    q: query.string({ description: 'Search books by title or author' }),
    page: query.integer({
      default: 1,
      min: 1,
      description: '1-based page number',
    }),
  },
  { description: 'Filter and paginate bookstore titles' },
);
```

Enable WebMCP synchronization in your Lit component with `UrlController` or `createUrlState`:

```ts title="src/components/catalog-filters/catalog-filters.ts"
import { html, LithonoElement, UrlController } from 'lithono/client';
import { catalogQuery } from '@/lib/catalog-query.ts';

export default class CatalogFilters extends LithonoElement {
  filters = new UrlController(this, catalogQuery, {
    mcp: {
      name: 'filter_catalog',
      description: 'Filter or paginate the bookstore catalog',
    },
  });

  render() {
    return html`<p>Page ${this.filters.value.page}</p>`;
  }
}
```

When an agent invokes the generated tool, Lithono validates the input, maps `null` values to `undefined` to reset individual parameters, updates the URL history, and runs loader revalidation (`effect: 'revalidate'` when a revalidation callback is present, or `local` otherwise), returning the new `UrlSnapshot`. See [URL state reference](/docs/reference-url-state).

## Component tools with WebMcpController

Custom components can expose imperative browser methods using either the `@webmcpTool` decorator on a `LithonoElement` subclass or an explicit `WebMcpController`:

```ts title="src/components/map-panel/map-panel.ts"
import { html, LithonoElement, webmcpTool } from 'lithono/client';
import { z } from 'zod';

const zoomSchema = z.object({
  level: z.number().min(1).max(20).describe('Map zoom level'),
});

export default class MapPanel extends LithonoElement {
  zoom = 12;

  @webmcpTool({
    name: 'set_map_zoom',
    description: 'Set the active map viewport zoom level',
    schema: zoomSchema,
    annotations: { readOnlyHint: true },
  })
  setZoom(input: { level: number }) {
    this.zoom = input.level;
    return { zoom: this.zoom };
  }

  render() {
    return html`<p>Zoom: ${this.zoom}</p>`;
  }
}
```

Both Stage 2 (`experimentalDecorators: true`) and standard Stage 3 decorators are supported. For dynamic tools scoped to repeated component instances, construct `new WebMcpController(this, { tools, scope })` directly or call `this.registerWebMcpTool(...)` on any `LithonoElement` host. Tools are registered on `hostConnected()` and unregistered automatically on `hostDisconnected()`. See [reactive controllers](/docs/reference-controllers).

## Configuration and inspection

Call `configureWebMcp(...)` from `lithono/webmcp` (or `lithono` / `lithono/client`) in your client entrypoint to adjust global defaults at runtime:

```ts title="src/client-setup.ts"
import { configureWebMcp } from 'lithono/webmcp';

configureWebMcp({
  enabled: true,
  prefix: 'bookstore_',
  declarativeForms: true,
  autoActions: true,
  resultFormat: 'auto',
});
```

In development and automated tests, inspect and invoke registered tools without a browser extension through `window.__LITHONO_WEBMCP__`:

- `window.__LITHONO_WEBMCP__.tools`: returns currently registered imperative tools and JSON Schemas.
- `window.__LITHONO_WEBMCP__.forms`: discovers active `<form toolname>` descriptors in the document.
- `window.__LITHONO_WEBMCP__.executeTool(name, input)`: runs a registered tool handler or submits a discovered declarative form and returns the result.
- `setWebMcpAdapter(customAdapter)`: replaces the active adapter in Node or browser tests.
