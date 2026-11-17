---
title: Inspect the lab and generated output
description: Use runnable experiments to understand ownership, URL state, forms, and what the browser actually loads.
section: Guides
---

The [lab](/lab) is a focused environment for investigating framework behavior. It complements the larger business examples with small ownership, state, validation, and loading experiments.

## What to inspect

- Two consumers of shared URL state.
- Native controls alongside enhanced behavior.
- Delayed and failed component imports.
- Server-rendered markup before browser upgrade.
- Form success, validation, and navigation outcomes.

Use browser developer tools with Preserve log enabled when observing navigation. Compare a normal interaction with JavaScript disabled or an explicit native opt-out.

## Source versus generated code

An authoring `.html` file is compiled into a Lit template module. Vite then resolves and builds that module. The pre-bundling compiler output and the actual client module are related but different artifacts.

Look under `dist/inspect` after a build for generated output and diagnostics. In a running application, the Network panel shows the actual module URLs delivered to the browser.

## Public lab sources

These are fixed, explicitly public source files included at authoring time. No URL parameter is converted into a filesystem path.

```ts source="src/pages/lab/page.ts" title="Public lab route module"
```

```html source="src/pages/lab/page.html" title="Public lab HTML"
```

```ts source="src/components/lab-controls/lab-controls.ts" title="Light component TypeScript"
```

```css source="src/components/lab-controls/lab-controls.css" title="Component CSS"
```

## Current compiler output

This snapshot is compiled from the current public lab HTML with its action and hydration contract. It is a generated client template module **before** Vite resolution and bundling. Its exported hydration flag and child-tag metadata explain the compiler's decisions; the Network panel remains the source for actual loaded URLs.

```ts generated="lab" title="Generated client template module (current compiler, before bundling)"
```

The [component directory](/components) includes fixed public source examples. Their filenames are labels, not user-controlled filesystem paths.

## The documentation's code component

The docs use a small browser component to enhance server-rendered code. Its implementation illustrates a useful boundary: the browser adds an event listener, but the server owns the highlighted markup.

```ts source="src/components/docs-code/docs-code.client.ts"
```

The component copies `pre code` text rather than the entire panel. This preserves source whitespace without including its filename, language label, or copy feedback.

## Questions worth testing

Does the same layout node survive navigation? Does an unsaved input retain its value during a loader refresh? Can an obsolete request overwrite a newer result? Does a disconnected component release its listeners?

These are observable application contracts. A screenshot alone cannot prove them, and a passing server test cannot establish browser ownership behavior.

See [rendering](/docs/rendering) for the execution model and [components](/docs/components) for DOM ownership.
