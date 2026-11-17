---
title: Optional animation API
description: Reference anime.js helpers, controller cleanup, reduced motion, presets, and client-only declarative animation elements.
section: API reference
---

`lithono/animate` is an optional anime.js integration. Install the compatible `animejs` peer before using it. Keep motion supplementary: book titles, stock counts, errors, and action results must remain understandable without animation.

## Availability and registration

This entry re-exports helpers **and registers** `<lithono-animate>` with its styles. It is a browser integration; its element lifecycle calls `window.matchMedia` and schedules animation frames. Use a client-only registration module rather than importing this entry in server routes or an SSR registration module.

```ts title="src/components/book-motion.client.ts"
import 'lithono/animate';
```

```ts title="lithono.config.ts"
import { defineConfig } from 'lithono/config';

export default defineConfig({
  elements: {
    'lithono-animate': {
      import: '@/components/book-motion.client.ts',
      mode: 'client-only',
    },
  },
});
```

Server fallback content remains ordinary HTML. Test that it remains visible when JavaScript is disabled and when reduced motion is requested.

## AnimateController

`new AnimateController(host: ReactiveControllerHost)` registers itself with the host. Create it once per owning component.

| Method | Behavior |
| --- | --- |
| `enter(targets, params)` | Calls anime.js `animate`; returns its handle, or undefined when reduced motion is requested |
| `timeline(params?)` | Creates and tracks an anime.js timeline |
| `leave()` | Calls `revert()` on tracked animations/timelines and clears the list |
| `hostDisconnected()` | Calls `leave()` automatically |

Targets and parameters use anime.js `TargetsParam`, `AnimationParams`, and `TimelineParams`. Call animation methods only after browser targets exist. If overriding a component's disconnect lifecycle, call the superclass so Lit can notify controllers.

`enter()` checks reduced motion. `timeline()` does **not** perform that check: explicitly gate timeline creation when appropriate. The controller tracks only handles created through its methods, not arbitrary calls to re-exported helpers.

## Direct anime.js helpers

The entry re-exports `animate`, `createTimeline`, `onScroll`, and `stagger` with anime.js's own contracts. Lithono does not automatically track or clean up handles created directly. Retain and release them in the owner lifecycle according to the upstream API.

`prefersReducedMotion(): boolean` reads `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. It requires a browser and reads the current preference when called; it does not install a preference-change listener.

```ts
import { createTimeline, prefersReducedMotion } from 'lithono/animate';

// Run inside browser lifecycle work in a client-only component.
if (!prefersReducedMotion()) {
  const timeline = createTimeline().add('.book-cover', { opacity: [0, 1] });
  // Retain timeline and call timeline.revert() when its owner disconnects.
}
```

## LithonoAnimateElement

`LithonoAnimateElement` is the registered class for `<lithono-animate>`. Its `root = 'host'` leaves parent-authored children intact; `render()` returns `nothing`. It animates direct element children, excluding template elements.

| Attribute/property | Default / meaning |
| --- | --- |
| `preset` | `fade-up`; unknown runtime values fall back to this preset |
| `stagger` | `0`; positive milliseconds of delay between children |
| `trigger` | `load`; `scroll` uses anime.js `onScroll({ target: this })` |
| `once` | `false`; boolean presence prevents a later connection from playing again after the first play |

```html
<lithono-animate preset="fade" stagger="60" once>
  <article>First published book</article>
  <article>Second published book</article>
</lithono-animate>
```

Connection checks reduced motion, sets `data-animate-pending`, and schedules a play. Disconnect reverts the active animation. `once` is not a persisted flag across replacement DOM nodes. Property changes do not have a separate replay/update hook; this is a connection-time enhancement, not a full animation state machine.

## PRESETS and types

`AnimatePreset` is `'fade-up' | 'fade' | 'scale' | 'slide'`. `PresetParams` has optional opacity/x/y/scale number pairs, duration, and ease. `PRESETS` is the exported record:

| Preset | Values | Duration / ease |
| --- | --- | --- |
| `fade-up` | opacity 0→1, y 16→0 | 600 ms, `outQuad` |
| `fade` | opacity 0→1 | 500 ms, `outQuad` |
| `scale` | opacity 0→1, scale 0.96→1 | 500 ms, `outQuad` |
| `slide` | opacity 0→1, x 24→0 | 600 ms, `outQuad` |

These objects are not frozen application settings. Prefer passing explicit parameters to a controller for a one-off effect rather than mutating global presets. [The executable lifecycle checkpoint](/docs/executable-examples#animate-with-a-clear-owner-and-cleanup) supplies complete client-only files and browser checks for native fallback, reduced motion, and tracked-handle cleanup.
