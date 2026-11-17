import { post, redirect, HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { requireUser } from 'lithono/auth';
import { sqlite } from '../../server/db.ts';
import { createCommunity } from '../../server/repositories/community.ts';
import { createEmailOutbox } from '../../server/repositories/email-outbox.ts';
import { createEmailDelivery } from '../../server/integrations/email.ts';
import { requireWorkspace, isEditor } from '../../server/workspace.ts';
import { paymentOrigin } from '../../server/integrations/payments.ts';
export const hydrate = true;
export function loader(ctx: Loader) {
  const topic = ['platform','events'].includes(ctx.url.searchParams.get('topic') ?? '') ? ctx.url.searchParams.get('topic')! : '';
  const repo = createCommunity(sqlite); const sub = ctx.user ? repo.subscription(ctx.user.id) : undefined;
  const delivery = sub ? createEmailOutbox(sqlite).get(sub.owner, sub.outbox_id) : undefined;
  return { posts: repo.list(topic), topic, editorial: ctx.user ? isEditor(ctx.user) : false, subscriptionState: sub?.state ?? 'not subscribed', delivery: delivery?.status === 'sent' ? 'Resend accepted confirmation email; inbox delivery not confirmed.' : delivery ? `Email ${delivery.status}; acceptance not confirmed.` : 'No email queued.' };
}
export const actions = {
  subscribe: post(async ctx => {
    const user = requireUser(ctx); const owner = requireWorkspace(ctx).id;
    const origin = paymentOrigin(); if (!origin) throw new HttpError(503, 'Configure LITHONO_APP_ORIGIN for confirmation links');
    const sub = createCommunity(sqlite).subscribe(owner, user.email, origin);
    if (sub.state === 'pending') await createEmailDelivery(sqlite).deliver(owner, sub.outbox_id);
    redirect('/community');
  }),
  retry: post(async ctx => {
    const user = requireUser(ctx); const sub = createCommunity(sqlite).subscription(user.id);
    if (sub?.state === 'pending') await createEmailDelivery(sqlite).deliver(user.id, sub.outbox_id);
    redirect('/community');
  }),
};
