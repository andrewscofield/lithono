---
title: Authentication and account-owned data
description: Connect Better Auth to native actions, keep identity private by default, and scope bookstore reads and writes to the authenticated account.
section: Guides
---

Chapter House has public shops and a private catalog backoffice. The important connection is server identity → owner-scoped repository → a small public UI projection. You can apply that pattern to a single protected page without building the complete bookstore.

For a complete generated app, database setup, provider declaration dependencies, and native/enhanced account verification, use [tutorial 2](/docs/tutorial-accounts). The snippets below explain the integration contract; the showcase source fence depends on that app's workspace modules.

## Configure the provider and plugin

In a generated application, install `better-auth` and configure a database supported by that provider. Create its instance in `src/server/auth.ts`. Enable the login method you intend to use, set the canonical base URL and trusted origins, and supply your deployment secret through environment configuration. Better Auth owns the database schema and provider settings; Lithono connects that instance to requests.

```ts title="src/index.ts"
import { createLithonoApp } from 'lithono/server';
import { authPlugin } from 'lithono/auth';
import { auth } from '@/server/auth.ts';

export default createLithonoApp({
  plugins: [authPlugin({ auth })],
  auth: {
    publicUser: ({ user }) => user
      ? { id: user.id, email: user.email, name: user.name }
      : null,
  },
});
```

This setup assumes provider migrations have already been applied. `migrate: true` is an explicit alternative for environments where startup should run Better Auth migrations. The showcase uses that option for its local SQLite experience.

Without `publicUser`/`publicSession`, both public projections are null, even after sign-in. Session cookies and full server locals are separate from the UI projection. The [auth reference](/docs/reference-auth) lists defaults and helper signatures.

## Build login as a native action

Validate email/password on the server, call the request-bound helper, then redirect so the destination has a fresh authenticated context. A minimal standalone login can always return to the catalog:

```ts title="src/pages/login/page.ts"
import { post, redirect } from 'lithono';
import { z } from 'zod';

export const actions = {
  signIn: post(z.object({ email: z.email(), password: z.string().min(1) }), async ctx => {
    if (!ctx.auth) throw new Error('Auth is not configured');
    await ctx.auth.signInEmail(ctx, ctx.input);
    redirect('/bookstore/admin');
  }),
};
```

```html title="src/pages/login/page.html"
<h1>Sign in</h1>
<form method="post" action="${actions.signIn.url}">
  <label>Email <input name="email" type="email" autocomplete="username" required></label>
  <small data-error-for="email">${actions.signIn.issue('email') ?? ''}</small>
  <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
  <p data-form-error>${actions.signIn.error ?? ''}</p>
  <button type="submit">Sign in</button>
</form>
```

Registration uses `ctx.auth.signUpEmail(ctx, { email, password, name })`. Logout uses `ctx.auth.signOut(ctx)` in a POST action followed by a redirect. Do not use a GET mutation for logout.

If you add `next`, validate it as a local absolute path before redirecting. Chapter House's shared login rejects external/protocol-relative destinations; do not trust a hidden input or query parameter merely because your own link originally generated it.

## Protect every operation

Use `requireUser(ctx)` in protected loaders and actions. For account-owned catalogs, the showcase's `requireWorkspace(ctx)` resolves the owner from the authenticated user; repository calls include that owner on every lookup/write.

This is the real catalog route, including separate authorization for its loader and create action:

```ts source="src/pages/bookstore/admin/page.ts"
```

Notice that the submitted product schema has no trusted owner ID. The action derives ownership from the request and passes it to the repository. Filtering only a list while leaving `one(id)` or `save(id)` unscoped would still allow cross-account access.

A layout loader can render account navigation, but it cannot protect child work: loaders run concurrently and actions can be called directly. Resource routes and plugin API endpoints need their own authorization too.

## Keep public shops separate

The public `/bookstore/shop/[store]` routes deliberately accept a public store identity and query only published products. They do not reuse the staff list and hide draft cards in CSS. The backoffice can display drafts; the storefront repository contract excludes them.

Prices remain integer **USD cents** until presentation, with `$` formatting at the UI edge. Identity and publication filters are independent of price or stock formatting. Current stock means on hand; checkout, reservations, orders, and shipping are later workflows.

## Verify the whole boundary

Test anonymous HTML navigation (redirect), anonymous JSON action calls (401), authenticated access, and another account's product ID. Verify a draft stays absent from public routes and a published book becomes visible only in its owner's shop.

Run login/create/receive/publish flows with JavaScript both enabled and disabled. After logout, make a new request and verify server authorization rather than checking only that the avatar disappeared. See [testing](/docs/testing) for the repository's executable cases and [debugging](/docs/debugging) for cookies, origins, redirects, and snapshot diagnostics.
