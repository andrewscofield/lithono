import { post, redirect, HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { sqlite } from '../../../../server/db.ts';
import { createCommunity } from '../../../../server/repositories/community.ts';
export const hydrate = false;
export function loader(ctx: Loader) {
  const subscription = createCommunity(sqlite).byToken(ctx.params.token);
  if (!subscription) throw new HttpError(404, 'Subscription link not found');
  return { state: subscription.state, unsubscribe: ctx.url.searchParams.get('unsubscribe') === '1' };
}
export const actions = { confirm: post(ctx => { createCommunity(sqlite).lifecycle(ctx.params.token, false); redirect(`/community/newsletter/${ctx.params.token}`); }), unsubscribe: post(ctx => { createCommunity(sqlite).lifecycle(ctx.params.token, true); redirect(`/community/newsletter/${ctx.params.token}?unsubscribe=1`); }) };
