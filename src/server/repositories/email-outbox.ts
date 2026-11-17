import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../database/migrations.ts';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface OutboxRecord {
  id: string;
  workspace_id: string;
  payload: string;
  status: 'pending' | 'sending' | 'sent' | 'unavailable' | 'failed';
  attempts: number;
  first_attempt_at: number | null;
  next_attempt_at: number;
  provider_id: string | null;
  last_error: string | null;
}

export function createEmailOutbox(database: DatabaseSync) {
  const get = (workspaceId: string, id: string) => database.prepare(
    'SELECT * FROM showcase_email_outbox WHERE workspace_id = ? AND id = ?',
  ).get(workspaceId, id) as OutboxRecord | undefined;
  return {
    get,
    enqueue(workspaceId: string, key: string, message: EmailMessage, now = Date.now()): OutboxRecord {
      if (!key.trim() || key.length > 200) throw new Error('An idempotency key of 1–200 characters is required');
      if (!message.to.trim() || !message.subject.trim() || !message.text.trim()) {
        throw new Error('Email recipient, subject and text are required');
      }
      const payload = JSON.stringify({ to: message.to, subject: message.subject, text: message.text });
      return transaction(database, () => {
        database.prepare(`INSERT INTO showcase_email_outbox
          (id, workspace_id, idempotency_key, payload, created_at, next_attempt_at)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`)
          .run(randomUUID(), workspaceId, key, payload, now, now);
        const row = database.prepare(`SELECT * FROM showcase_email_outbox
          WHERE workspace_id = ? AND idempotency_key = ?`).get(workspaceId, key) as unknown as OutboxRecord;
        if (row.payload !== payload) throw new Error('Idempotency key already used for a different email');
        return row;
      });
    },
    claim(workspaceId: string, id: string, now: number): OutboxRecord | undefined {
      // Retry within Resend's 24-hour idempotency retention, with a safety margin.
      const result = database.prepare(`UPDATE showcase_email_outbox SET
        status = 'sending', attempts = attempts + 1, lease_until = ?,
        first_attempt_at = COALESCE(first_attempt_at, ?)
        WHERE workspace_id = ? AND id = ? AND status != 'sent'
        AND next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?)
        AND attempts < 8 AND (first_attempt_at IS NULL OR first_attempt_at > ?)`)
        .run(now + 60000, now, workspaceId, id, now, now, now - 23 * 60 * 60 * 1000);
      return result.changes ? get(workspaceId, id) : undefined;
    },
    finish(workspaceId: string, id: string, attempt: number, result: {
      status: 'sent' | 'failed' | 'unavailable'; providerId?: string; error?: string; retryAt: number;
    }) {
      const unattempted = result.status === 'unavailable' ? 1 : 0;
      database.prepare(`UPDATE showcase_email_outbox SET status = ?, provider_id = ?,
        last_error = ?, next_attempt_at = ?, lease_until = NULL,
        first_attempt_at = CASE WHEN ? = 1 AND attempts = 1 THEN NULL ELSE first_attempt_at END,
        attempts = attempts - ?
        WHERE workspace_id = ? AND id = ? AND status = 'sending' AND attempts = ?`)
        .run(result.status, result.providerId ?? null, result.error ?? null,
          result.retryAt, unattempted, unattempted, workspaceId, id, attempt);
    },
  };
}
