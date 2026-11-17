import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { openDatabase } from '../../src/server/database.ts';
import { createWorkshops } from '../../src/server/repositories/workshops.ts';
import { createWorkspaceRepository } from '../../src/server/repositories/workspaces.ts';
import { verifyStripe, paymentOrigin, checkout, workshopPaymentsPlugin } from '../../src/server/integrations/payments.ts';
import { createEmailDelivery } from '../../src/server/integrations/email.ts';
import { getProviderConfig } from '../../src/server/integrations/config.ts';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setup() {
  const db = openDatabase(':memory:');
  for (const owner of ['a', 'b']) createWorkspaceRepository(db).forUser(owner);
  let now = 1790000000000;
  const repo = createWorkshops(db, () => now);
  const reserve = repo.reserve;
  repo.reserve = (owner, token, sessionId, email, quantity) => {
    db.prepare('INSERT OR IGNORE INTO workshop_tokens VALUES (?,?,?,?)').run(token, owner, sessionId, now + 86400000);
    return reserve(owner, token, sessionId, email, quantity);
  };
  return { db, repo, advance: () => { now += 32 * 60000; } };
}
test('free bookings capacity, ownership, input binding and outbox are atomic', async () => {
  const { db, repo } = setup();
  try {
    const token = crypto.randomUUID();
    const a = repo.reserve('a', token, 'native-forms', 'a@example.test', 6);
    assert.equal(a.state, 'confirmed');
    assert.equal(repo.reserve('a', token, 'native-forms', 'a@example.test', 6).id, a.id);
    assert.throws(() => repo.reserve('a', token, 'native-forms', 'a@example.test', 5), /different inputs/);
    assert.throws(() => repo.reserve('a', crypto.randomUUID(), 'native-forms', 'a@example.test', 1.5));
    repo.reserve('b', crypto.randomUUID(), 'native-forms', 'b@example.test', 6);
    assert.throws(() => repo.reserve('a', crypto.randomUUID(), 'native-forms', 'a@example.test', 1), /places/);
    assert.equal(repo.get('b', a.id), undefined);
    repo.cancel('a', a.id);
    assert.equal(repo.get('a', a.id)?.state, 'confirmed');
    const unavailable = await createEmailDelivery(db, { config: () => getProviderConfig({}) }).deliver('a', a.outbox_id!);
    assert.equal(unavailable.status, 'unavailable');
    const failed = await createEmailDelivery(db, { config: () => getProviderConfig({ RESEND_API_KEY: 'fixture', RESEND_FROM: 'a@example.test' }), fetch: async () => new Response('', { status: 503 }) }).deliver('a', a.outbox_id!);
    assert.equal(failed.status, 'failed');
    assert.equal(repo.get('a', a.id)?.state, 'confirmed');
  } finally { db.close(); }
});
test('paid holds, duplicate events, authoritative matching, late payment reconciliation and no downgrade', () => {
  const { db, repo, advance } = setup();
  try {
    const b = repo.reserve('a', crypto.randomUUID(), 'component-lab', 'a@example.test', 6);
    repo.attach(b, 'cs_test_one', 'https://checkout.stripe.com/test');
    assert.throws(() => repo.reserve('b', crypto.randomUUID(), 'component-lab', 'b@example.test', 3), /places/);
    const event = { id: 'evt_one', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_one', livemode: false, metadata: { bookingId: b.id }, amount_total: b.amount, currency: b.currency, payment_status: 'paid' } } };
    for (const mismatch of [{ amount_total: 1 }, { currency: 'usd' }, { payment_status: 'unpaid' }, { metadata: { bookingId: 'other' } }, { livemode: true }, { id: 'cs_test_other' }]) {
      repo.event({ ...event, id: crypto.randomUUID(), data: { object: { ...event.data.object, ...mismatch } } });
      assert.equal(repo.get('a', b.id)?.state, 'pending');
    }
    repo.event(event); repo.event(event);
    assert.equal(repo.get('a', b.id)?.state, 'confirmed');
    repo.event({ ...event, id: 'evt_expired', type: 'checkout.session.expired' });
    assert.equal(repo.get('a', b.id)?.state, 'confirmed');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM showcase_email_outbox').get()?.n, 1);
    const late = repo.reserve('b', crypto.randomUUID(), 'component-lab', 'b@example.test', 2);
    repo.attach(late, 'cs_test_late', 'https://checkout.stripe.com/test');
    advance(); repo.cleanup();
    assert.equal(repo.get('b', late.id)?.state, 'expired');
    repo.reserve('a', crypto.randomUUID(), 'component-lab', 'a@example.test', 2);
    repo.event({ ...event, id: 'evt_late', data: { object: { ...event.data.object, id: 'cs_test_late', metadata: { bookingId: late.id }, amount_total: late.amount } } });
    assert.equal(repo.get('b', late.id)?.state, 'needs_attention');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM showcase_email_outbox').get()?.n, 1);
  } finally { db.close(); }
});
test('raw Stripe signature, timestamp and strict origin validation', () => {
  const raw = '{"id":"evt_1"}'; const now = Date.now(); const t = String(Math.floor(now / 1000));
  const signature = createHmac('sha256', 'whsec_fixture').update(`${t}.${raw}`).digest('hex');
  assert.equal(verifyStripe(raw, `t=${t},v1=${signature}`, 'whsec_fixture', now), true);
  for (const header of [`t=${t},v1=ab`, `t=${t},t=${t},v1=${signature}`, `t=1,v1=${signature}`]) assert.equal(verifyStripe(raw, header, 'whsec_fixture', now), false);
  assert.equal(verifyStripe(raw + ' ', `t=${t},v1=${signature}`, 'whsec_fixture', now), false);
  assert.equal(paymentOrigin('https://example.test/path'), undefined);
  assert.equal(paymentOrigin('https://user:password@example.test'), undefined);
  assert.equal(paymentOrigin('http://example.test'), undefined);
  assert.equal(paymentOrigin('http://127.0.0.1:4197'), 'http://127.0.0.1:4197');
});
test('Checkout REST contract uses server amounts, stable key and rejects live provider response', async () => {
  const previous = { ...process.env };
  const { db, repo } = setup();
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture'; process.env.LITHONO_APP_ORIGIN = 'http://127.0.0.1:4197';
    const b = repo.reserve('a', crypto.randomUUID(), 'component-lab', 'a@example.test', 2);
    let calls = 0;
    const transport: typeof fetch = async (url, options) => {
      assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
      assert.equal(new Headers(options?.headers).get('Idempotency-Key'), `workshop-${b.id}`);
      const body = options!.body as URLSearchParams;
      assert.equal(body.get('line_items[0][price_data][unit_amount]'), '2500');
      assert.equal(body.get('line_items[0][quantity]'), '2'); calls++;
      return Response.json({ id: 'cs_test_fixture', url: 'https://checkout.stripe.com/test', livemode: false });
    };
    await Promise.all([checkout(b, transport), checkout(b, transport)]); assert.equal(calls, 2);
    await assert.rejects(checkout(b, async () => Response.json({ id: 'cs_live_bad', url: 'https://checkout.stripe.com/test', livemode: true })));
    const app = new Hono(); await workshopPaymentsPlugin(db).configure!(app);
    assert.equal((await app.request('/integrations/stripe/webhook', { method: 'POST', body: '{}' })).status, 400);
    process.env.STRIPE_SECRET_KEY = 'sk_live_rejected'; await assert.rejects(checkout(b, transport));
  } finally { process.env = previous; db.close(); }
});
test('separate SQLite connections race for capacity without overselling', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'workshop-race-'));
  const path = join(dir, 'app.sqlite');
  const db = openDatabase(path);
  try {
    for (const owner of ['one', 'two', 'three', 'four']) createWorkspaceRepository(db).forUser(owner);
    const codes = await Promise.all(['one', 'two', 'three', 'four'].map(owner => new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'tests/showcase-node/workshop-race.ts', path, owner], { stdio: 'ignore' });
      child.on('error', reject); child.on('exit', resolve);
    })));
    assert.equal(codes.filter(code => code === 0).length, 2);
    assert.equal(db.prepare('SELECT SUM(quantity) AS n FROM workshop_bookings').get()?.n, 6);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('server tokens and Checkout lease, cancelled or early paid events require attention', () => {
  const { db, repo } = setup();
  try {
    const strict = createWorkshops(db, () => 1790000000000);
    assert.throws(() => strict.reserve('a', crypto.randomUUID(), 'component-lab', 'a@example.test', 1), /expired/);
    const token = strict.issue('a', 'component-lab');
    assert.throws(() => strict.reserve('b', token, 'component-lab', 'a@example.test', 1), /expired/);
    const b = strict.reserve('a', token, 'component-lab', 'a@example.test', 1);
    assert.equal(repo.claimCheckout(b), true);
    assert.equal(repo.claimCheckout(b), false);
    repo.cancel('a', b.id);
    repo.attach(b, 'cs_test_cancelled', 'https://checkout.stripe.com/test');
    repo.event({ id: 'evt_cancel', livemode: false, type: 'checkout.session.completed', data: { object: { id: 'cs_test_cancelled', livemode: false, metadata: { bookingId: b.id }, amount_total: b.amount, currency: b.currency, payment_status: 'paid' } } });
    assert.equal(repo.get('a', b.id)?.state, 'needs_attention');
    const early = repo.reserve('a', crypto.randomUUID(), 'component-lab', 'a@example.test', 1);
    repo.event({ id: 'evt_early', livemode: false, type: 'checkout.session.completed', data: { object: { id: 'cs_test_early', livemode: false, metadata: { bookingId: early.id }, amount_total: early.amount, currency: early.currency, payment_status: 'paid' } } });
    assert.equal(repo.get('a', early.id)?.state, 'needs_attention');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM showcase_email_outbox').get()?.n, 0);
  } finally { db.close(); }
});
