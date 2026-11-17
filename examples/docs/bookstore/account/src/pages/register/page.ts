import { post, redirect } from 'lithono';
import { signUpSchema } from '@/lib/auth-input.ts';

export const actions = {
  register: post(signUpSchema, async ctx => {
    if (!ctx.auth) throw new Error('Auth is not configured');
    await ctx.auth.signUpEmail(ctx, ctx.input);
    redirect('/admin');
  }),
};
