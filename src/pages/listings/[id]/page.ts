import { get, post, HttpError, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { requireUser } from 'lithono/auth';
import { z } from 'zod';
import { labelFor, updatePriceSchema } from '../../../lib/schemas/auth.ts';
import { sqlite } from '../../../server/db.ts';
import { createPropertyRepository, InquiryConflictError } from '../../../server/repositories/properties.ts';
import { requireWorkspace } from '../../../server/workspace.ts';
import { createEmailDelivery } from '../../../server/integrations/email.ts';
import { createEmailOutbox } from '../../../server/repositories/email-outbox.ts';

export const inquirySchema = z.object({
  submissionKey: z.uuid(),
  message: z.string().trim().min(10, 'Please write at least 10 characters').max(2000),
});

export const meta = ({ data }: { data: Awaited<ReturnType<typeof loader>> }) => ({
  title: `${data.listing.address} · Lithono`,
});

export function loader({ params, request, user }: Loader) {
  const listing = createPropertyRepository(sqlite).get(params.id);
  if (!listing) throw new HttpError(404, 'Listing not found');
  const receiptId = new URL(request.url).searchParams.get('inquiry');
  const receipt = user && receiptId ? sqlite.prepare('SELECT id, outbox_id FROM property_inquiries WHERE id = ? AND workspace_id = ? AND listing_id = ?')
    .get(receiptId, user.id, params.id) as { id: string; outbox_id: string } | undefined : undefined;
  const delivery = receipt && user ? createEmailOutbox(sqlite).get(user.id, receipt.outbox_id) : undefined;
  const deliveryMessage = !delivery ? '' : delivery.status === 'sent'
    ? 'Inquiry recorded. Resend accepted your receipt email; inbox delivery is not confirmed.'
    : delivery.status === 'unavailable'
      ? 'Inquiry recorded. Email unavailable: configure RESEND_API_KEY and RESEND_FROM. No email was sent.'
      : delivery.status === 'failed'
        ? 'Inquiry recorded. Email delivery failed: Resend did not confirm acceptance. Retry after the delivery backoff.'
        : 'Inquiry recorded. Email delivery is pending; acceptance has not been confirmed.';
  return {
    inquiryKey: crypto.randomUUID(),
    receiptId: receipt?.id ?? '',
    deliveryMessage,
    listing: {
      ...listing,
      kindLabel: labelFor(listing.kind),
      statusLabel: labelFor(listing.status),
      priceLabel: `$${listing.price.toLocaleString()}`,
    },
  };
}

export const actions = {
  inquire: post(inquirySchema, async (ctx) => {
    const user = requireUser(ctx);
    const workspace = requireWorkspace(ctx);
    if (!createPropertyRepository(sqlite).get(ctx.params.id)) throw new HttpError(404, 'Listing not found');
    let inquiry;
    try {
      inquiry = createPropertyRepository(sqlite).inquiry(workspace.id, ctx.params.id, ctx.input.submissionKey, user.email, ctx.input.message);
    } catch (error) {
      if (error instanceof InquiryConflictError) throw new HttpError(409, 'This inquiry key was already used. Reload before starting a different inquiry.');
      throw error;
    }
    await createEmailDelivery(sqlite).deliver(workspace.id, inquiry.outbox_id);
    redirect(`/listings/${encodeURIComponent(ctx.params.id)}?inquiry=${inquiry.id}`);
  }),
  retryInquiry: post(z.object({ receiptId: z.uuid() }), async (ctx) => {
    const workspace = requireWorkspace(ctx);
    const receipt = sqlite.prepare('SELECT outbox_id FROM property_inquiries WHERE id = ? AND workspace_id = ? AND listing_id = ?')
      .get(ctx.input.receiptId, workspace.id, ctx.params.id) as { outbox_id: string } | undefined;
    if (!receipt) throw new HttpError(404, 'Inquiry not found');
    await createEmailDelivery(sqlite).deliver(workspace.id, receipt.outbox_id);
    redirect(`/listings/${encodeURIComponent(ctx.params.id)}?inquiry=${ctx.input.receiptId}`);
  }),
  updatePrice: post(updatePriceSchema, async (ctx) => {
    requireUser(ctx);
    const listing = ctx.db.updatePrice(ctx.params.id, ctx.input.price);
    if (!listing) throw new HttpError(404, 'Listing not found');
    return { success: true, newPrice: listing.price, reason: ctx.input.reason ?? null };
  }),
  delete: post(async (ctx) => {
    requireUser(ctx);
    const ok = ctx.db.deleteListing(ctx.params.id);
    if (!ok) throw new HttpError(404, 'Listing not found');
    redirect('/listings');
  }),
  checkAvailability: get(z.object({ date: z.string() }), async ({ input }) => {
    return {
      date: input.date,
      slots: ['09:00', '11:30', '15:00'],
    };
  }),
};

export type PageActions = typeof actions;
