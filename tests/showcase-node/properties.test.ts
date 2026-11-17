import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/server/database.ts';
import { createPropertyRepository, seedProperties } from '../../src/server/repositories/properties.ts';
import { propertyQuery, propertyHref } from '../../src/lib/property-query.ts';
import { createWorkspaceRepository } from '../../src/server/repositories/workspaces.ts';
import { createEmailDelivery } from '../../src/server/integrations/email.ts';
import { createEmailOutbox } from '../../src/server/repositories/email-outbox.ts';
import { getProviderConfig } from '../../src/server/integrations/config.ts';
import { transaction } from '../../src/server/database/migrations.ts';

test('composed repository transactions use savepoints and roll back outbox with business receipt', () => {
  const database = openDatabase(':memory:');
  try {
    createWorkspaceRepository(database).forUser('a');
    assert.throws(() => transaction(database, () => {
      createPropertyRepository(database).inquiry('a', '1', 'rollback', 'a@example.test', 'A durable inquiry');
      throw new Error('outer failure');
    }), /outer failure/);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM property_inquiries').get()?.n, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM showcase_email_outbox').get()?.n, 0);
    transaction(database, () => {
      assert.throws(() => transaction(database, () => {
        database.exec("INSERT INTO lists VALUES ('nested', 'Rollback', 1)");
        throw new Error('nested failure');
      }), /nested failure/);
      database.exec("INSERT INTO lists VALUES ('outer', 'Commit', 1)");
    });
    assert.equal(database.prepare("SELECT id FROM lists WHERE id = 'nested'").get(), undefined);
    assert.ok(database.prepare("SELECT id FROM lists WHERE id = 'outer'").get());
  } finally { database.close(); }
});

test('property query strictly defaults malformed values, preserves unrelated repeats and atomically resets page', () => {
  const q = propertyQuery.read('?min=1e4&max=12.5&page=2&page=3&kind=castle&view=oops');
  assert.equal(q.min, 0);
  assert.equal(q.max, 1000000000);
  assert.equal(q.page, 1);
  assert.equal(q.kind, 'all');
  const href = propertyHref('http://local/listings?tag=a&tag=b&page=4#x', { q: 'Bend', page: 1 });
  assert.deepEqual(new URL(href, 'http://local').searchParams.getAll('tag'), ['a', 'b']);
  assert.equal(new URL(href, 'http://local').searchParams.has('page'), false);
});

test('additive property seeds preserve legacy IDs; SQL filters, escaped search, stable sorting and page clamps agree', () => {
  const database = openDatabase(':memory:');
  try {
    const repo = createPropertyRepository(database);
    assert.equal(repo.get('1')?.address, '123 Main Street');
    assert.equal(repo.search('?').total, 28);
    seedProperties(database);
    assert.equal(repo.search('?').total, 28);
    assert.equal(repo.search('?q=Bend').total, 5);
    assert.equal(repo.search('?q=%25').total, 0);
    assert.equal(repo.search('?min=500000&max=100000').total, 0);
    const result = repo.search('?kind=land&status=sold&sort=price-asc&page=999');
    assert.equal(result.query.page, result.pages);
    assert.ok(result.listings.every(item => item.kind === 'land' && item.status === 'sold'));
    const first = repo.search('?sort=price-asc');
    const second = repo.search('?sort=price-asc&page=2');
    assert.equal(new Set([...first.listings, ...second.listings].map(item => item.id)).size, 12);
    assert.ok(first.listings[5].price <= second.listings[0].price);
    database.exec("DELETE FROM listings WHERE id = 'explorer-01'");
    seedProperties(database);
    assert.equal(repo.get('explorer-01'), undefined);
  } finally { database.close(); }
});

test('durable inquiries deduplicate, isolate workspaces, survive unavailable/failed delivery and accept once on retry', async () => {
  const database = openDatabase(':memory:');
  try {
    const repo = createPropertyRepository(database);
    const workspaces = createWorkspaceRepository(database);
    workspaces.forUser('a'); workspaces.forUser('b');
    const input = ['a', '1', 'submission', 'a@example.test', 'Please arrange a viewing.'] as const;
    const inquiry = repo.inquiry(...input);
    assert.equal(repo.inquiry(...input).id, inquiry.id);
    assert.throws(() => repo.inquiry('a', '1', 'submission', 'a@example.test', 'Different message'), /already used/);
    const outbox = createEmailOutbox(database);
    assert.equal(outbox.get('b', inquiry.outbox_id), undefined);
    const unavailable = await createEmailDelivery(database, { config: () => getProviderConfig({}) }).deliver('a', inquiry.outbox_id);
    assert.equal(unavailable.status, 'unavailable');
    let now = Date.now();
    const config = () => getProviderConfig({ RESEND_API_KEY: 'test', RESEND_FROM: 'test@example.test' });
    let calls = 0;
    const failed = createEmailDelivery(database, { config, now: () => now, fetch: async () => { calls++; return new Response('', { status: 503 }); } });
    assert.equal((await failed.deliver('a', inquiry.outbox_id)).status, 'failed');
    assert.equal((await failed.deliver('a', inquiry.outbox_id)).status, 'pending');
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM property_inquiries').get()?.n, 1);
    now += 31000;
    const accepted = createEmailDelivery(database, { config, now: () => now, fetch: async (_url, options) => {
      calls++;
      assert.equal(new Headers(options?.headers).get('Idempotency-Key'), `showcase-email-${inquiry.outbox_id}`);
      return Response.json({ id: 'provider-acceptance' });
    } });
    assert.equal((await accepted.deliver('a', inquiry.outbox_id)).status, 'sent');
    assert.equal((await accepted.deliver('a', inquiry.outbox_id)).status, 'sent');
    assert.equal(calls, 2);
  } finally { database.close(); }
});
