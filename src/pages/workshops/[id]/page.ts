import { HttpError, post, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { requireUser } from 'lithono/auth';
import { z } from 'zod';
import { sqlite } from '../../../server/db.ts';
import { createWorkshops } from '../../../server/repositories/workshops.ts';
import { requireWorkspace } from '../../../server/workspace.ts';
import { checkout, paidAvailable } from '../../../server/integrations/payments.ts';
import { createEmailDelivery } from '../../../server/integrations/email.ts';
export function loader(ctx: Loader) {
  const { params, user } = ctx;
  const repo = createWorkshops(sqlite);
  const session = repo.session(params.id);
  if (!session) throw new HttpError(404, 'Session not found');
  return { session, signedIn: Boolean(user), token: user ? repo.issue(requireWorkspace(ctx).id, session.id) : '', available: !session.price || paidAvailable(), time: new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: session.zone }).format(session.starts_at) };
}
export const actions = {
  book: post(z.object({ token: z.uuid(), quantity: z.coerce.number().int().min(1).max(6) }), async ctx => {
    const user = requireUser(ctx);
    const owner = requireWorkspace(ctx).id;
    const repo = createWorkshops(sqlite);
    const s = repo.session(ctx.params.id);
    if (!s) throw new HttpError(404, 'Session not found');
    if (s.price && !paidAvailable()) throw new HttpError(503, 'Paid bookings unavailable: configure Stripe test keys, webhook and LITHONO_APP_ORIGIN');
    let b;
    try { b = repo.reserve(owner, ctx.input.token, s.id, user.email, ctx.input.quantity); }
    catch (error) { throw new HttpError(409, (error as Error).message); }
    if (b.outbox_id) await createEmailDelivery(sqlite).deliver(owner, b.outbox_id);
    if (b.amount && b.state === 'pending') {
      if (b.checkout_url) redirect(b.checkout_url);
      if (!repo.claimCheckout(b)) redirect(`/workshops/bookings/${b.id}`);
      try {
        const result = await checkout(b);
        repo.attach(b, result.id, result.url);
        b = repo.get(owner, b.id)!;
      } catch {
        repo.cancel(owner, b.id);
        redirect(`/workshops/bookings/${b.id}`);
      }
      if (b.state === 'pending' && b.checkout_url) redirect(b.checkout_url);
    }
    redirect(`/workshops/bookings/${b.id}`);
  }),
};
