import { post, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { signUpSchema } from '../../lib/schemas/auth.ts';
import { authNext } from '../../lib/auth-next.ts';

export const meta = () => ({ title: 'Create account · Lithono' });

export function loader({ user, url }: Loader) {
  const next = authNext(url.searchParams.get('next'));
  if (user) redirect(next);
  return { loginHref: `/login?next=${encodeURIComponent(next)}`,
    signUpHref: `/register?_action=signUp&next=${encodeURIComponent(next)}` };
}

export const actions = {
  signUp: post(signUpSchema, async (ctx) => {
    if (!ctx.auth) throw new Error('Auth is not configured');
    await ctx.auth.signUpEmail(ctx, ctx.input);
    redirect(authNext(ctx.url.searchParams.get('next')));
  }),
};

export type PageActions = typeof actions;
