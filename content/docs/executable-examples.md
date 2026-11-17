---
title: Executable client lifecycle examples
description: Run verified controller/context subscriptions, form events, refresh recovery, navigation failures, auth projections, and reduced-motion cleanup.
section: Guides
---

Use this small application after [components and ownership](/docs/components) when you need browser-specific behavior. The [core bookstore tutorial](/docs/tutorial-bookstore) stays HTML-first; this checkpoint makes the advanced APIs observable in a real packaged application.

## Generate and start

After [preparing the local packages](/docs/tutorial-bookstore#prepare-the-packages-once), run from the Lithono checkout:

```shell
node tools/docs-project.mjs api-lifecycle ../lifecycle-examples
```

Open the generated app and use the [account environment/start commands](/docs/tutorial-accounts#generate-and-configure). The generator adds Better Auth, Zod, anime.js, and the narrowly scoped provider database types. Open `/` to see a shared demonstration counter, query state, a native form, and browser-only motion enhancements.

## Subscribe to loader and context values

Complete file: `src/components/lifecycle-panel/lifecycle-panel.ts`.

```ts source="examples/docs/api-lifecycle/src/components/lifecycle-panel/lifecycle-panel.ts"
```

`@state()` marks local component fields as reactive so a changed message triggers rendering. The controller fields are created once, not during `render()`. Page/action/params/session controllers consume page providers with snapshot fallback; `UrlController` starts/stops history listeners with the host lifecycle.

`@pageData()` and `@session()` consume contexts typed `unknown`. Their fields stay `unknown`; the render method asserts this example's known projection before reading it. A decorated field cannot claim an arbitrary narrower type than the provider. Controllers offer generic assertion convenience, while an assertion still does not validate external data.

Before browser context delivery, the decorator-only display can say it is waiting for a provider. Required initial content uses the snapshot-aware controller. Compare those lines with JavaScript disabled.

## Observe real form events

Complete file: `src/pages/page.html`.

```html source="examples/docs/api-lifecycle/src/pages/page.html"
```

Click **Commit through a native form**. With JavaScript disabled it redirects to updated server HTML. With JavaScript enabled the form controller emits `lithono:success` from the page host and the panel shows the action name.

The panel is a child of that host, so it explicitly listens on its nearest page. DOM bubbling does not send an ancestor's event downward into a child. The gate also submits an invalid hidden mode to exercise a real server-validation error event, then corrects it and verifies success. Disconnect removes these listeners; reconnect installs them again. The browser test detaches/reconnects the same panel and verifies the old owner listener is gone and query updates resume.

## Recover from a failed refresh without repeating a write

Complete file: `src/pages/page.ts`.

```ts source="examples/docs/api-lifecycle/src/pages/page.ts"
```

The counter is deliberately shared fixture data in SQLite. **Commit with failed refresh** increments it, then makes the action-triggered loader refresh fail. The action result remains successful and `lithono:revalidate-error` reports the refresh failure; the visible snapshot stays old. Click **Refresh view** to load the committed count through GET. Do not repeat the mutation just to repair a failed read.

This deliberate failure logs a server diagnostic. It is a reproducible recovery scenario, not the tutorial's durable receipt implementation.

## Coordinate history and navigation failure

**Next query page** patches the typed query with a revalidating push. Back/Forward updates the URL and subscribed display together. **Inspect catalog route params** opens `/demo/catalog`, whose `[id]` parameter is displayed by `ParamsController`; returning to `/` restores the root parameter view. **Try unavailable page** requests a deliberate 503 route; the existing view remains and a navigation-error message appears.

The router's active navigation path catches that destination failure, so an awaited `navigate()` is not a success assertion. The example listens to `lithono:navigation-error` on `document`. Normal links still express navigation where no custom interaction is needed.

## Project public session data explicitly

Complete replacement file: `src/index.ts`.

```ts source="examples/docs/api-lifecycle/src/index.ts"
```

The public session is only `{ label }`, showing Guest anonymously and the account name after registration/login and a new request. The controller and decorator see that same projection. Full server session credentials are not copied into the UI. See [authentication](/docs/authentication) for per-operation server authorization.

## Animate with a clear owner and cleanup

Complete file: `src/components/motion-sample.client.ts`.

```ts source="examples/docs/api-lifecycle/src/components/motion-sample.client.ts"
```

Complete file: `lithono.config.ts`.

```ts source="examples/docs/api-lifecycle/lithono.config.ts"
```

The `.client.ts` registration is selected as client-only, preserving useful fallback content during SSR. `root = 'host'` lets the enhancement leave parent-authored children in place. `enter()` skips motion when reduced motion is requested; timeline creation is gated explicitly because `timeline()` does not check automatically. The controller reverts tracked handles on disconnect.

## Verify the example

From the Lithono checkout, `pnpm test:docs:checkpoints api-lifecycle` generates, typechecks, builds, and exercises this exact source. It checks native content/submission, context updates, session projections, real form events, successful-write/failed-refresh recovery, query history, failed navigation, disconnect/reconnect, motion cleanup, and reduced-motion fallback with no browser page errors. See the [API references](/docs/reference-controllers) for signatures/defaults beyond these focused scenarios.
