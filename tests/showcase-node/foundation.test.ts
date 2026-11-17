import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../src/server/database.ts';
import { runMigrations, migrations } from '../../src/server/database/migrations.ts';
import { seedOnce } from '../../src/server/database/seeds.ts';
import { createWorkspaceRepository } from '../../src/server/repositories/workspaces.ts';
import { createEmailOutbox } from '../../src/server/repositories/email-outbox.ts';
import { createEmailDelivery } from '../../src/server/integrations/email.ts';
import { getProviderConfig } from '../../src/server/integrations/config.ts';

test('old SQLite records survive additive migration, reopening and seed deletion', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lithono-foundation-'));
  const path = join(directory, 'app.sqlite');
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE listings (id TEXT PRIMARY KEY, address TEXT NOT NULL, price INTEGER NOT NULL);
      INSERT INTO listings VALUES ('owned', 'Existing house', 123456);
      CREATE TABLE lists (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
      INSERT INTO lists VALUES ('old-list', 'Keep this', 42);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, list_id TEXT NOT NULL, title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      INSERT INTO tasks VALUES ('old-task', 'old-list', 'Keep task', 1, 43);
      CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT);
      INSERT INTO user VALUES ('old-user', 'keep@example.test');
    `);
    legacy.close();
    const migrated = openDatabase(path);
    assert.deepEqual({ ...migrated.prepare('SELECT id, address, price, kind, status, featured FROM listings WHERE id = ?').get('owned') }, {
      id: 'owned', address: 'Existing house', price: 123456,
      kind: 'house', status: 'for-sale', featured: 0,
    });
    assert.equal(migrated.prepare('SELECT title FROM tasks').get()?.title, 'Keep task');
    assert.equal(migrated.prepare('SELECT email FROM user').get()?.email, 'keep@example.test');
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM showcase_migrations').get()?.n, migrations.length);
    createWorkspaceRepository(migrated).forUser('old-user');
    const receipt = createEmailOutbox(migrated).enqueue('old-user', 'durable-receipt', {
      to: 'keep@example.test', subject: 'Receipt', text: 'Survives process restart',
    });
    migrated.exec('DELETE FROM tasks; DELETE FROM lists; DELETE FROM listings;');
    migrated.close();
    const reopened = openDatabase(path);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM listings').get()?.n, 0);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM lists').get()?.n, 0);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM showcase_migrations').get()?.n, migrations.length);
    assert.equal(createEmailOutbox(reopened).get('old-user', receipt.id)?.status, 'pending');
    assert.equal(createEmailOutbox(reopened).enqueue('old-user', 'durable-receipt', {
      to: 'keep@example.test', subject: 'Receipt', text: 'Survives process restart',
    }).id, receipt.id);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('fresh seeds are deterministic and migration/seed failures roll back atomically', () => {
  const first = openDatabase(':memory:');
  const second = openDatabase(':memory:');
  try {
    assert.deepEqual(first.prepare('SELECT * FROM tasks ORDER BY id').all(),
      second.prepare('SELECT * FROM tasks ORDER BY id').all());
    const nextVersion = Math.max(...migrations.map(step => step.version)) + 1;
    assert.throws(() => runMigrations(first, [{ version: nextVersion, name: 'failing migration', up(db) {
      db.exec('CREATE TABLE should_rollback (id TEXT)');
      throw new Error('failure');
    } }]), /failure/);
    assert.equal(first.prepare("SELECT name FROM sqlite_master WHERE name = 'should_rollback'").get(), undefined);
    assert.equal(first.prepare('SELECT version FROM showcase_migrations WHERE version = ?').get(nextVersion), undefined);
    assert.throws(() => seedOnce(first, 'test', 'a', 1, () => {
      first.prepare('INSERT INTO lists VALUES (?, ?, ?)').run('rollback', 'Bad seed', 1);
      throw new Error('seed failure');
    }), /seed failure/);
    assert.equal(first.prepare("SELECT id FROM lists WHERE id = 'rollback'").get(), undefined);
    let calls = 0;
    assert.equal(seedOnce(first, 'test', 'a', 1, () => { calls++; }), true);
    assert.equal(seedOnce(first, 'test', 'a', 1, () => { calls++; }), false);
    assert.equal(seedOnce(first, 'test', 'b', 1, () => { calls++; }), true);
    assert.equal(calls, 2);
  } finally { first.close(); second.close(); }
});

test('workspace ownership and outbox reads/keys are isolated', () => {
  const db = openDatabase(':memory:');
  try {
    const workspaces = createWorkspaceRepository(db);
    assert.deepEqual(workspaces.forUser('alice'), workspaces.forUser('alice'));
    workspaces.forUser('bob');
    assert.throws(() => workspaces.forUser(''), /authenticated/);
    assert.throws(() => workspaces.assertOwner('alice', 'bob'), /not found/);
    const outbox = createEmailOutbox(db);
    const message = { to: 'a@example.test', subject: 'Hello', text: 'Durable receipt' };
    const alice = outbox.enqueue('alice', 'receipt:1', message);
    assert.equal(outbox.enqueue('alice', 'receipt:1', message).id, alice.id);
    assert.notEqual(outbox.enqueue('bob', 'receipt:1', message).id, alice.id);
    assert.equal(outbox.get('bob', alice.id), undefined);
    assert.throws(() => outbox.enqueue('alice', 'receipt:1', { ...message, text: 'Changed' }), /different email/);
    assert.throws(() => outbox.enqueue('unknown', 'receipt:1', message), /FOREIGN KEY/);
  } finally { db.close(); }
});

test('configuration reports unavailable providers, rejects live Stripe, normalizes editor allowlist', () => {
  const empty = getProviderConfig({});
  assert.equal(empty.email.available, false);
  assert.equal(empty.payment.checkoutAvailable, false);
  assert.deepEqual(empty.editorEmails, []);
  assert.equal(getProviderConfig({ STRIPE_SECRET_KEY: 'sk_live_local_fake' }).payment.checkoutAvailable, false);
  const configured = getProviderConfig({
    RESEND_API_KEY: 'fake-local', RESEND_FROM: 'sender@example.test',
    STRIPE_SECRET_KEY: 'sk_test_local_fake', STRIPE_WEBHOOK_SECRET: 'whsec_local_fake',
    LITHONO_EDITOR_EMAILS: ' Editor@Example.test, second@example.test ',
    LITHONO_MAP_STYLE_URL: 'https://tiles.example.test/style.json',
  });
  assert.equal(configured.email.available, true);
  assert.equal(configured.payment.webhookAvailable, true);
  assert.deepEqual(configured.editorEmails, ['editor@example.test', 'second@example.test']);
  assert.equal(configured.map.styleUrl, 'https://tiles.example.test/style.json');
});

test('delivery persists unavailable status then accepts once; concurrent/duplicate retries do not resend', async () => {
  const db = openDatabase(':memory:');
  try {
    createWorkspaceRepository(db).forUser('alice');
    const outbox = createEmailOutbox(db);
    const row = outbox.enqueue('alice', 'welcome', { to: 'a@example.test', subject: 'Hello', text: 'Welcome' }, 1000);
    let config = getProviderConfig({});
    let requests = 0;
    let complete!: (response: Response) => void;
    const delivery = createEmailDelivery(db, {
      config: () => config, now: () => 1000,
      fetch: async (_url, init) => {
        requests++;
        assert.equal(new Headers(init?.headers).get('Idempotency-Key'), `showcase-email-${row.id}`);
        assert.equal(JSON.parse(String(init?.body)).text, 'Welcome');
        return new Promise<Response>(resolve => { complete = resolve; });
      },
    });
    assert.equal((await delivery.deliver('alice', row.id)).status, 'unavailable');
    assert.equal(outbox.get('alice', row.id)?.status, 'unavailable');
    assert.equal(outbox.get('alice', row.id)?.attempts, 0);
    assert.equal(outbox.get('alice', row.id)?.first_attempt_at, null);
    config = getProviderConfig({ RESEND_API_KEY: 'fake-local', RESEND_FROM: 'sender@example.test' });
    const sending = delivery.deliver('alice', row.id);
    assert.equal((await delivery.deliver('alice', row.id)).status, 'pending');
    complete(Response.json({ id: 'provider-1' }));
    assert.deepEqual(await sending, { status: 'sent', providerId: 'provider-1' });
    assert.deepEqual(await delivery.deliver('alice', row.id), { status: 'sent', providerId: 'provider-1' });
    assert.equal(requests, 1);
    assert.equal(outbox.get('alice', row.id)?.provider_id, 'provider-1');
    await assert.rejects(delivery.deliver('bob', row.id), /not found/);
  } finally { db.close(); }
});

test('failed provider requests retain receipts, back off and stop before deduplication expires', async () => {
  const db = openDatabase(':memory:');
  try {
    createWorkspaceRepository(db).forUser('alice');
    const outbox = createEmailOutbox(db);
    let now = 1000;
    const row = outbox.enqueue('alice', 'retry', { to: 'a@example.test', subject: 'Retry', text: 'Receipt' }, now);
    const keys: string[] = [];
    const delivery = createEmailDelivery(db, {
      config: () => getProviderConfig({ RESEND_API_KEY: 'fake-local', RESEND_FROM: 'sender@example.test' }),
      now: () => now,
      fetch: async (_url, init) => {
        keys.push(new Headers(init?.headers).get('Idempotency-Key')!);
        if (keys.length === 1) return new Response('provider error', { status: 503 });
        return Response.json({ id: 'retry-success' });
      },
    });
    assert.equal((await delivery.deliver('alice', row.id)).status, 'failed');
    assert.equal(outbox.get('alice', row.id)?.status, 'failed');
    assert.equal((await delivery.deliver('alice', row.id)).status, 'pending');
    now += 30000;
    assert.equal((await delivery.deliver('alice', row.id)).status, 'sent');
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    const expired = outbox.enqueue('alice', 'expired', { to: 'a@example.test', subject: 'Expired', text: 'Receipt' }, now);
    const claimed = outbox.claim('alice', expired.id, now)!;
    outbox.finish('alice', expired.id, claimed.attempts, { status: 'failed', retryAt: now });
    now += 23 * 60 * 60 * 1000;
    assert.equal((await delivery.deliver('alice', expired.id)).status, 'pending');
    assert.equal(keys.length, 2);
  } finally { db.close(); }
});

test('expired leases recover safely and attempt limits prevent unbounded retries', () => {
  const db = openDatabase(':memory:');
  try {
    createWorkspaceRepository(db).forUser('alice');
    const outbox = createEmailOutbox(db);
    const row = outbox.enqueue('alice', 'lease', { to: 'a@example.test', subject: 'Lease', text: 'Receipt' }, 1000);
    const first = outbox.claim('alice', row.id, 1000)!;
    assert.equal(outbox.claim('alice', row.id, 2000), undefined);
    const second = outbox.claim('alice', row.id, 61000)!;
    outbox.finish('alice', row.id, first.attempts, { status: 'sent', providerId: 'stale', retryAt: 61000 });
    assert.equal(outbox.get('alice', row.id)?.status, 'sending');
    outbox.finish('alice', row.id, second.attempts, { status: 'failed', retryAt: 61000 });
    for (let attempt = 3; attempt <= 8; attempt++) {
      const claimed = outbox.claim('alice', row.id, 61000)!;
      assert.equal(claimed.attempts, attempt);
      outbox.finish('alice', row.id, attempt, { status: 'failed', retryAt: 61000 });
    }
    assert.equal(outbox.claim('alice', row.id, 61000), undefined);
  } finally { db.close(); }
});

test('transport failures and malformed provider acceptance never claim sent', async () => {
  const db = openDatabase(':memory:');
  try {
    createWorkspaceRepository(db).forUser('alice');
    const outbox = createEmailOutbox(db);
    const config = () => getProviderConfig({ RESEND_API_KEY: 'fake-local', RESEND_FROM: 'sender@example.test' });
    for (const [key, provider] of [
      ['no-id', async () => Response.json({})],
      ['transport', async () => { throw new Error('Sensitive transport detail'); }],
    ] as const) {
      const row = outbox.enqueue('alice', key, { to: 'a@example.test', subject: key, text: 'Receipt' });
      const result = await createEmailDelivery(db, { config, fetch: provider }).deliver('alice', row.id);
      assert.equal(result.status, 'failed');
      assert.equal(outbox.get('alice', row.id)?.provider_id, null);
      assert.equal(outbox.get('alice', row.id)?.last_error?.includes('Sensitive'), false);
    }
  } finally { db.close(); }
});
