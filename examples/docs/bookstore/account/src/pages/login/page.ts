import { post, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { signInSchema, localNext } from '@/lib/auth-input.ts';

export function loader({ url }: Loader) {
  const next = localNext(url.searchParams.get('next'));
  return { signInURL: `/login?_action=signIn&next=${encodeURIComponent(next)}` };
}
export const actions = {
  signIn: post(signInSchema, async ctx => {
    if (!ctx.auth) throw new Error('Auth is not configured');
    await ctx.auth.signInEmail(ctx, ctx.input);
    redirect(localNext(ctx.url.searchParams.get('next')));
  }),
};
