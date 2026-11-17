import { post, HttpError, redirect } from 'lithono';

export const actions = {
  signOut: post(async (ctx) => {
    if (!ctx.auth) throw new HttpError(500, 'Auth is not configured');
    await ctx.auth.signOut(ctx);
    redirect('/');
  }),
};
