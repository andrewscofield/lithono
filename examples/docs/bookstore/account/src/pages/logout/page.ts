import { post, redirect } from 'lithono';

export const actions = {
  signOut: post(async ctx => {
    if (!ctx.auth) throw new Error('Auth is not configured');
    await ctx.auth.signOut(ctx);
    redirect('/');
  }),
};
