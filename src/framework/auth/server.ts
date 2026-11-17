import type { Auth } from 'better-auth';
import { APIError } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import type { Context, Hono } from 'hono';
import { HttpError, redirect } from '../define.ts';
import { wantsJson } from '../server/actions.ts';
import type { LithonoPlugin, RequestContext } from '../types.ts';

export interface LithonoUser {
  id: string;
  email: string;
  name: string;
  [key: string]: unknown;
}

export interface LithonoSession {
  id: string;
  userId: string;
  [key: string]: unknown;
}

export interface LithonoAuthApi {
  signInEmail(
    ctx: RequestContext,
    input: { email: string; password: string; rememberMe?: boolean }
  ): Promise<unknown>;
  signUpEmail(
    ctx: RequestContext,
    input: { email: string; password: string; name: string }
  ): Promise<unknown>;
  signOut(ctx: RequestContext): Promise<unknown>;
}

declare module 'lithono' {
  interface Locals {
    user?: LithonoUser | null;
    session?: LithonoSession | null;
    auth?: LithonoAuthApi;
  }
}

export interface AuthPluginOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auth: Auth<any>;
  basePath?: string;
  migrate?: boolean;
}

function applyHeaders(c: Context, headers?: Headers) {
  if (!headers) return;
  const cookies =
    typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (cookies.length) {
    for (const cookie of cookies) {
      c.header('Set-Cookie', cookie, { append: true });
    }
    return;
  }
  const single = headers.get('set-cookie');
  if (single) c.header('Set-Cookie', single, { append: true });
}

function unwrapAuthResult(c: Context, result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const record = result as { headers?: Headers; response?: unknown };
  if (record.headers instanceof Headers) applyHeaders(c, record.headers);
  if ('response' in record) {
    if (record.response instanceof APIError) {
      throw new HttpError(record.response.statusCode ?? 400, record.response.message ?? 'Auth failed');
    }
    return record.response;
  }
  return result;
}

function rethrowAuth(error: unknown): never {
  if (error instanceof APIError) {
    throw new HttpError(error.statusCode ?? 400, error.message || 'Auth failed');
  }
  throw error;
}

function createAuthApi(auth: AuthPluginOptions['auth']): LithonoAuthApi {
  return {
    async signInEmail(ctx, input) {
      try {
        const result = await auth.api.signInEmail({
          body: input,
          headers: ctx.request.headers,
          returnHeaders: true,
        });
        return unwrapAuthResult(ctx.c, result);
      } catch (error) {
        rethrowAuth(error);
      }
    },
    async signUpEmail(ctx, input) {
      try {
        const result = await auth.api.signUpEmail({
          body: input,
          headers: ctx.request.headers,
          returnHeaders: true,
        });
        return unwrapAuthResult(ctx.c, result);
      } catch (error) {
        rethrowAuth(error);
      }
    },
    async signOut(ctx) {
      try {
        const result = await auth.api.signOut({
          headers: ctx.request.headers,
          returnHeaders: true,
        });
        return unwrapAuthResult(ctx.c, result);
      } catch (error) {
        rethrowAuth(error);
      }
    },
  };
}

export function requireUser(
  ctx: Pick<RequestContext, 'user' | 'c' | 'url'>,
  options?: { redirectTo?: string }
) {
  if (ctx.user) return ctx.user;
  if (wantsJson(ctx.c)) {
    throw new HttpError(401, 'Unauthorized');
  }
  const next = encodeURIComponent(`${ctx.url.pathname}${ctx.url.search}`);
  const target = options?.redirectTo ?? `/login?next=${next}`;
  redirect(target);
}

export function authPlugin(options: AuthPluginOptions): LithonoPlugin {
  const { auth, basePath = '/api/auth', migrate = false } = options;
  const helpers = createAuthApi(auth);

  return {
    name: 'lithono-auth',
    async ready() {
      if (!migrate) return;
      const { runMigrations } = await getMigrations(auth.options);
      await runMigrations();
    },
    configure(app: Hono) {
      app.all(basePath, (c) => auth.handler(c.req.raw));
      app.all(`${basePath}/*`, (c) => auth.handler(c.req.raw));
    },
    async locals(c) {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      return {
        user: (session?.user as LithonoUser | undefined) ?? null,
        session: (session?.session as LithonoSession | undefined) ?? null,
        auth: helpers,
      };
    },
  };
}
