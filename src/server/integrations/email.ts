import type { DatabaseSync } from 'node:sqlite';
import { createEmailOutbox } from '../repositories/email-outbox.ts';
import { getProviderConfig } from './config.ts';
import type { ProviderConfig } from './config.ts';

export type EmailDelivery =
  | { status: 'sent'; providerId: string }
  | { status: 'unavailable' | 'failed' | 'pending'; reason: string };

/** Server-only REST adapter. Persistence/leases survive requests; I/O is outside transactions. */
export function createEmailDelivery(database: DatabaseSync, options: {
  config?: () => ProviderConfig;
  fetch?: typeof fetch;
  now?: () => number;
} = {}) {
  const outbox = createEmailOutbox(database);
  const clock = options.now ?? Date.now;
  const request = options.fetch ?? fetch;
  return {
    async deliver(workspaceId: string, id: string): Promise<EmailDelivery> {
      const existing = outbox.get(workspaceId, id);
      if (!existing) throw new Error('Email not found in this workspace');
      if (existing.status === 'sent') return { status: 'sent', providerId: existing.provider_id! };
      const config = (options.config ?? getProviderConfig)().email;
      const now = clock();
      const row = outbox.claim(workspaceId, id, now);
      if (!row) return { status: 'pending', reason: 'Delivery leased, deferred, or retry window exhausted; inspect outbox before retrying' };
      if (!config.available) {
        const reason = 'Email unavailable: configure RESEND_API_KEY and RESEND_FROM';
        outbox.finish(workspaceId, id, row.attempts, { status: 'unavailable', error: reason, retryAt: now });
        // finish atomically restores the unused provider retry budget/window.
        return { status: 'unavailable', reason };
      }
      try {
        const response = await request('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `showcase-email-${id}`,
          },
          body: JSON.stringify({ from: config.from, ...JSON.parse(row.payload) }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`Resend delivery failed (HTTP ${response.status})`);
        const body = await response.json() as { id?: unknown };
        if (typeof body.id !== 'string' || !body.id) throw new Error('Resend returned no delivery id');
        outbox.finish(workspaceId, id, row.attempts, { status: 'sent', providerId: body.id, retryAt: now });
        // Sent means provider accepted, not inbox delivery; no webhook confirmation yet.
        return { status: 'sent', providerId: body.id };
      } catch {
        // Do not persist provider response bodies or transport errors containing credentials.
        const reason = 'Resend did not confirm acceptance; delivery can be retried within the retention window';
        outbox.finish(workspaceId, id, row.attempts, {
          status: 'failed', error: reason,
          retryAt: clock() + Math.min(3600000, 30000 * 2 ** (row.attempts - 1)),
        });
        return { status: 'failed', reason };
      }
    },
  };
}
