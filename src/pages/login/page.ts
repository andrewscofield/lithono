import { post, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { signInSchema } from '../../lib/schemas/auth.ts';
import { authNext } from '../../lib/auth-next.ts';

export const meta = () => ({ title: 'Sign in · Lithono' });

export function loader({ user, url }: Loader) {
  const next = authNext(url.searchParams.get('next'));
  if (user) redirect(next);
  return { next, registerHref: `/register?next=${encodeURIComponent(next)}`,
    signInHref: `/login?_action=signIn&next=${encodeURIComponent(next)}` };
}

export const actions = {
  signIn: post(signInSchema, async (ctx) => {
    if (!ctx.auth) throw new Error('Auth is not configured');
    await ctx.auth.signInEmail(ctx, ctx.input);
    const next = authNext(ctx.url.searchParams.get('next'));
    redirect(next);
  }),
};

export type PageActions = typeof actions;
