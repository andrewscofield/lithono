import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../database/migrations.ts';
import { createEmailOutbox } from './email-outbox.ts';

export interface Workshop { id: string; title: string; description: string; starts_at: number; zone: string; capacity: number; price: number; currency: string }
export interface Booking { id: string; workspace_id: string; token: string; session_id: string; email: string; quantity: number; amount: number; currency: string; expires_at: number; state: string; checkout_id: string | null; checkout_url: string | null; outbox_id: string | null }
export interface WorkshopStripeEventObject {
  id?: unknown;
  payment_status?: unknown;
  livemode?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  metadata?: { bookingId?: unknown };
  [key: string]: unknown;
}
export function createWorkshops(db: DatabaseSync, clock = Date.now) {
  const session = (id: string) => db.prepare('SELECT * FROM workshop_sessions WHERE id = ?').get(id) as unknown as Workshop | undefined;
  const get = (owner: string, id: string) => db.prepare('SELECT * FROM workshop_bookings WHERE workspace_id = ? AND id = ?').get(owner, id) as unknown as Booking | undefined;
  const cleanup = () => db.prepare("UPDATE workshop_bookings SET state = 'expired' WHERE state = 'pending' AND expires_at <= ?").run(clock());
  const confirm = (b: Booking) => {
    const s = session(b.session_id)!;
    const email = createEmailOutbox(db).enqueue(b.workspace_id, `workshop-${b.id}`, { to: b.email, subject: `Booking confirmed: ${s.title}`, text: `${b.quantity} place(s) confirmed for ${s.title}. UTC: ${new Date(s.starts_at).toISOString()}. Display zone: ${s.zone}.` }, clock());
    db.prepare("UPDATE workshop_bookings SET state = 'confirmed', outbox_id = ? WHERE id = ?").run(email.id, b.id);
  };
  return {
    session, get, cleanup,
    issue(owner: string, sessionId: string) {
      const token = crypto.randomUUID();
      db.prepare('INSERT INTO workshop_tokens VALUES (?,?,?,?)').run(token, owner, sessionId, clock() + 86400000);
      return token;
    },
    catalog: () => db.prepare('SELECT * FROM workshop_sessions ORDER BY starts_at').all() as unknown as Workshop[],
    claimCheckout(b: Booking) {
      return Boolean(db.prepare("UPDATE workshop_bookings SET checkout_lease = ? WHERE id = ? AND state = 'pending' AND expires_at > ? AND checkout_id IS NULL AND (checkout_lease IS NULL OR checkout_lease <= ?)").run(clock() + 60000, b.id, clock(), clock()).changes);
    },
    reserve(owner: string, token: string, sessionId: string, email: string, quantity: number) {
      return transaction(db, () => {
        cleanup();
        const old = db.prepare('SELECT * FROM workshop_bookings WHERE workspace_id = ? AND token = ?').get(owner, token) as unknown as Booking | undefined;
        if (old) {
          if (old.session_id !== sessionId || old.quantity !== quantity || old.email !== email) throw new Error('Submission token already used for different inputs');
          return old;
        }
        if (!db.prepare('SELECT token FROM workshop_tokens WHERE token = ? AND owner = ? AND session_id = ? AND expires_at > ?').get(token, owner, sessionId, clock())) throw new Error('Booking form expired; reload to obtain a new submission token');
        const s = session(sessionId);
        if (!s || s.starts_at <= clock()) throw new Error('Session unavailable');
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 6) throw new Error('Choose 1–6 attendees');
        const used = db.prepare("SELECT COALESCE(SUM(quantity),0) AS n FROM workshop_bookings WHERE session_id = ? AND (state = 'confirmed' OR (state = 'pending' AND expires_at > ?))").get(sessionId, clock()) as { n: number };
        if (used.n + quantity > s.capacity) throw new Error('Not enough places available');
        const id = crypto.randomUUID();
        db.prepare(`INSERT INTO workshop_bookings (id,workspace_id,token,session_id,email,quantity,amount,currency,expires_at,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,'pending',?)`).run(id, owner, token, sessionId, email, quantity, s.price * quantity, s.currency, clock() + 31 * 60000, clock());
        const b = get(owner, id)!;
        if (!s.price) confirm(b);
        return get(owner, id)!;
      });
    },
    attach(b: Booking, id: string, url: string) {
      db.prepare("UPDATE workshop_bookings SET checkout_id = ?, checkout_url = ?, checkout_lease = NULL WHERE id = ? AND (checkout_id IS NULL OR checkout_id = ?)").run(id, url, b.id, id);
    },
    cancel(owner: string, id: string) {
      db.prepare("UPDATE workshop_bookings SET state = 'cancelled' WHERE workspace_id = ? AND id = ? AND state = 'pending'").run(owner, id);
    },
    event(event: { id: string; type: string; livemode: boolean; data: { object: WorkshopStripeEventObject } }) {
      return transaction(db, () => {
        if (db.prepare('SELECT id FROM workshop_events WHERE id = ?').get(event.id)) return;
        cleanup();
        let outcome = 'ignored';
        const o = event.data.object;
        let b = db.prepare('SELECT * FROM workshop_bookings WHERE checkout_id = ?').get(typeof o.id === 'string' ? o.id : '') as unknown as Booking | undefined;
        // A signed event can beat Checkout's HTTP response, or follow an ambiguous
        // transport failure. Never confirm without our durable session reference.
        // Persist a reconciliation outcome instead of silently losing the payment.
        if (!b && event.type === 'checkout.session.completed' && o.payment_status === 'paid' && !event.livemode && o.livemode === false && typeof o.metadata?.bookingId === 'string') {
          const candidate = db.prepare('SELECT * FROM workshop_bookings WHERE id = ?').get(o.metadata.bookingId) as unknown as Booking | undefined;
          if (candidate && candidate.checkout_id === null && candidate.amount === o.amount_total && candidate.currency === o.currency) {
            db.prepare("UPDATE workshop_bookings SET state = 'needs_attention' WHERE id = ? AND state != 'confirmed'").run(candidate.id);
            outcome = 'needs_attention: unmatched Checkout session; reconcile provider reference';
            b = candidate;
          }
        }
        if (b && b.checkout_id === o.id && !event.livemode && o.livemode === false && o.metadata?.bookingId === b.id && o.amount_total === b.amount && o.currency === b.currency) {
          if (event.type === 'checkout.session.completed' && o.payment_status === 'paid') {
            if (b.state === 'pending' && b.expires_at > clock()) confirm(b);
            else if (b.state !== 'confirmed') db.prepare("UPDATE workshop_bookings SET state = 'needs_attention' WHERE id = ?").run(b.id);
            outcome = get(b.workspace_id, b.id)!.state;
          } else if (event.type === 'checkout.session.expired' && b.state === 'pending') {
            db.prepare("UPDATE workshop_bookings SET state = 'expired' WHERE id = ?").run(b.id);
            outcome = 'expired';
          }
        }
        db.prepare('INSERT INTO workshop_events VALUES (?,?,?)').run(event.id, outcome, clock());
        return b ? get(b.workspace_id, b.id) : undefined;
      });
    },
  };
}
