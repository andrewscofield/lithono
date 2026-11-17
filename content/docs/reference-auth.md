---
title: Optional authentication API
description: Reference Better Auth plugin configuration, identity locals, server helpers, redirects, and the separate browser client.
section: API reference
---

Authentication is optional. Install the compatible `better-auth` peer in applications that use `lithono/auth` or `lithono/auth/client`. The base framework does not require an auth database. See [the authentication guide](/docs/authentication) for the connected bookstore workflow.

For a strictly typechecked Node consumer, see [the verified provider declaration setup](/docs/tutorial-accounts#generate-and-configure). The tested Better Auth declarations reference the optional `bun:sqlite` type; the tutorial loads only that declaration rather than importing Bun globals or skipping dependency checks.

## authPlugin

`authPlugin(options: AuthPluginOptions): LithonoPlugin` wraps an application-created Better Auth instance.

| Option | Default / contract |
| --- | --- |
| `auth` | Required Better Auth `Auth` instance |
| `basePath` | `/api/auth`; registers that exact path and its wildcard |
| `migrate` | `false`; when true, runs Better Auth migrations in the plugin's startup `ready()` hook |

Configure Better Auth's own base path/base URL consistently with the plugin; changing this mount does not rewrite the provider's configuration. Migrations are a startup choice, not an implicit feature of every request.

The plugin's `locals(c)` calls `auth.api.getSession` using incoming request headers and supplies `user`, `session`, and an `auth` helper object. It does not automatically serialize those locals. `createLithonoApp({ auth: { publicUser, publicSession } })` controls what reaches the browser; both projections default to null.

## Identity types and Locals augmentation

Import server identity types from `lithono/auth`:

| Type | Required fields |
| --- | --- |
| `LithonoUser` | `id`, `email`, `name` strings; additional unknown fields allowed |
| `LithonoSession` | `id`, `userId` strings; additional unknown fields allowed |
| `LithonoAuthApi` | `signInEmail`, `signUpEmail`, `signOut` methods |

The server integration augments `lithono`'s `Locals` with optional `user?: LithonoUser | null`, `session?: LithonoSession | null`, and `auth?: LithonoAuthApi`. When the plugin runs, unauthenticated identity values are null and the helper object is present. Optional types also accommodate applications/routes where auth is not configured.

Do not send the complete provider session or user object through a loader merely because its type permits extra fields. Return only the fields the UI needs.

## requireUser

`requireUser(ctx: Pick<RequestContext, 'user' | 'c' | 'url'>, options?: { redirectTo?: string }): LithonoUser` returns the authenticated user or throws:

- JSON-oriented requests receive `HttpError(401, 'Unauthorized')`.
- HTML requests receive the framework's default 303 redirect to `/login?next=` plus the encoded pathname/search.
- `redirectTo` replaces that HTML destination verbatim. It is not a prefix to which `next` is appended.

```ts
import type { Loader } from 'lithono';
import { requireUser } from 'lithono/auth';

export function loader(ctx: Loader) {
  const user = requireUser(ctx);
  return { accountName: user.name };
}
```

Use it inside **each** protected loader/action or a shared function called by that operation. A parent layout loader is not an authorization barrier for a concurrently running page loader or a direct action request. `requireUser` proves authentication; add owner/role checks for the specific resource.

## Request-bound auth helpers

The helper methods accept the current `RequestContext` so they can forward request headers and append provider cookies to the Hono response:

| Method | Input / result |
| --- | --- |
| `ctx.auth.signInEmail(ctx, input)` | `{ email, password, rememberMe? }`; `Promise<unknown>` |
| `ctx.auth.signUpEmail(ctx, input)` | `{ email, password, name }`; `Promise<unknown>` |
| `ctx.auth.signOut(ctx)` | No body argument; `Promise<unknown>` |

Better Auth `APIError` failures become `HttpError` with the provider's status/message. Other errors propagate. Helpers copy Set-Cookie headers, unwrap the provider's response, and do not update the already-collected `ctx.user`/`ctx.session` locals in place. After login/logout, redirect to establish a fresh request and identity snapshot.

Validate form input with an action schema. Do not return the unknown provider response as a public loader/action payload without examining it; a successful helper call followed by `redirect()` is often sufficient.

## Browser client

`lithono/auth/client` re-exports Better Auth's framework-neutral `createAuthClient`. It takes Better Auth client options and returns its client API; Lithono does not add another hook or session store to it.

```ts title="src/lib/auth-client.ts"
import { createAuthClient } from 'lithono/auth/client';

export const authClient = createAuthClient();
```

Use this only when you need provider client operations beyond native route actions. A client sign-in/sign-out does not automatically refresh Lithono's loader projections; navigate or revalidate explicitly afterward. Client-rendered identity is presentation state, while server authorization always uses the request.

The server entry imports provider migrations and must stay out of browser bundles. Use `import type` for server-only type references in browser components and `lithono/auth/client` for browser runtime imports. See [testing](/docs/testing) for anonymous, authenticated, and cross-owner cases.
