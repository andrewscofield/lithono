import { HttpError, post, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { requireUser } from 'lithono/auth';
import { sqlite } from '../../../../server/db.ts';
import { createWorkshops } from '../../../../server/repositories/workshops.ts';
import { createEmailOutbox } from '../../../../server/repositories/email-outbox.ts';
import { createEmailDelivery } from '../../../../server/integrations/email.ts';
import { getProviderConfig } from '../../../../server/integrations/config.ts';
export function loader(ctx: Loader) {
  const user = requireUser(ctx);
  const repo = createWorkshops(sqlite);
  repo.cleanup();
  const booking = repo.get(user.id, ctx.params.id);
  if (!booking) throw new HttpError(404, 'Booking not found');
  const email = booking.outbox_id ? createEmailOutbox(sqlite).get(user.id, booking.outbox_id) : undefined;
  const emailAvailable = getProviderConfig().email.available;
  const delivery = email?.status === 'sent' ? 'Your confirmation email was accepted by Resend.'
    : email && !emailAvailable ? 'Email delivery is not configured for this demo. Your booking is saved; read your confirmation below.'
    : email?.status === 'failed' ? 'Your booking is saved, but the confirmation email could not be sent. You can retry shortly.'
    : email ? 'Your booking is saved. Your confirmation email is waiting to be sent.' : 'A confirmation will be available once your booking is confirmed.';
  return { booking, session: repo.session(booking.session_id)!, delivery,
    confirmation: email ? JSON.parse(email.payload) as { to: string; subject: string; text: string } : null,
    canRetry: Boolean(email && emailAvailable && email.status !== 'sent' && email.next_attempt_at <= Date.now()),
    expires: new Date(booking.expires_at).toISOString() };
}
export const actions = {
  cancel: post(ctx => {
    const user = requireUser(ctx);
    createWorkshops(sqlite).cancel(user.id, ctx.params.id);
    redirect(`/workshops/bookings/${ctx.params.id}`);
  }),
  retry: post(async ctx => {
    const user = requireUser(ctx);
    const b = createWorkshops(sqlite).get(user.id, ctx.params.id);
    if (!b) throw new HttpError(404, 'Booking not found');
    if (b.outbox_id) await createEmailDelivery(sqlite).deliver(user.id, b.outbox_id);
    redirect(`/workshops/bookings/${ctx.params.id}`);
  }),
};
