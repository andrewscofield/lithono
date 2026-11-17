import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Booking } from '../repositories/workshops.ts';
import { getProviderConfig } from './config.ts';

export function paymentOrigin(value = process.env.LITHONO_APP_ORIGIN): string | undefined {
  try {
    const u = new URL(value ?? '');
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return;
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return;
    return u.origin;
  } catch { return; }
}
export const paidAvailable = () => Boolean(getProviderConfig().payment.webhookAvailable && paymentOrigin());

export async function checkout(b: Booking, request: typeof fetch = fetch) {
  const config = getProviderConfig().payment;
  const origin = paymentOrigin();
  if (!config.webhookAvailable || !origin) throw new Error('Stripe test Checkout unavailable; configure test keys, webhook and application origin');
  const body = new URLSearchParams({ mode: 'payment', success_url: `${origin}/workshops/bookings/${b.id}`, cancel_url: `${origin}/workshops/bookings/${b.id}?cancel=1`, client_reference_id: b.id, 'metadata[bookingId]': b.id, 'line_items[0][price_data][currency]': b.currency, 'line_items[0][price_data][unit_amount]': String(b.amount / b.quantity), 'line_items[0][price_data][product_data][name]': 'Workshop booking (test mode)', 'line_items[0][quantity]': String(b.quantity), expires_at: String(Math.floor(b.expires_at / 1000)) });
  body.set('customer_email', b.email);
  body.set('payment_method_types[0]', 'card');
  const response = await request('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${config.secretKey}`, 'Idempotency-Key': `workshop-${b.id}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Stripe did not create Checkout');
  const result = await response.json() as { id: string; url: string; livemode: boolean };
  if (result.livemode !== false || !result.id?.startsWith('cs_test_') || typeof result.url !== 'string' || new URL(result.url).origin !== 'https://checkout.stripe.com') throw new Error('Invalid test Checkout response');
  return result;
}

export function verifyStripe(raw: string, header: string, secret: string, now = Date.now()) {
  const parts = header.split(',').map(part => part.split('='));
  const timestamps = parts.filter(([k]) => k === 't');
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0][1])) return false;
  const t = timestamps[0][1];
  if (Math.abs(now / 1000 - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest();
  return parts.some(([k, v]) => k === 'v1' && /^[a-f0-9]{64}$/i.test(v) && timingSafeEqual(expected, Buffer.from(v, 'hex')));
}

export function workshopPaymentsPlugin(database: import('node:sqlite').DatabaseSync): import('../../framework/types.ts').LithonoPlugin { return {
  name: 'workshop-test-payments',
  configure(app) {
    app.post('/integrations/stripe/webhook', async c => {
      const config = getProviderConfig().payment;
      if (!config.webhookAvailable) return c.text('Stripe test webhook unavailable', 503);
      const raw = await c.req.text();
      if (!verifyStripe(raw, c.req.header('stripe-signature') ?? '', config.webhookSecret!)) return c.text('Invalid signature', 400);
      let event;
      try {
        event = JSON.parse(raw);
        if (typeof event.id !== 'string' || !event.id.startsWith('evt_') || typeof event.type !== 'string' || event.livemode !== false || !event.data?.object || typeof event.data.object !== 'object') throw new Error();
      } catch { return c.text('Invalid test event', 400); }
      const { createWorkshops } = await import('../repositories/workshops.ts');
      const { createEmailDelivery } = await import('./email.ts');
      const b = createWorkshops(database).event(event);
      if (b?.outbox_id) await createEmailDelivery(database).deliver(b.workspace_id, b.outbox_id);
      return c.json({ received: true });
    });
  },
}; }
