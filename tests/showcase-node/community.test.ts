import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/server/database.ts';
import { createWorkspaceRepository } from '../../src/server/repositories/workspaces.ts';
import { createCommunity } from '../../src/server/repositories/community.ts';
test('publication drafts, versions, scoped marks and idempotent newsletter lifecycle', () => {
  const db = openDatabase(':memory:');
  try {
    for (const o of ['a','b']) createWorkspaceRepository(db).forUser(o);
    const r = createCommunity(db);
    r.mark('a','native-web','bookmark',true); r.mark('a','native-web','bookmark',true); assert.deepEqual(r.marks('b','native-web'), []); assert.equal(r.marks('a','native-web').length, 1);
    assert.throws(() => r.mark('a','native-web','rsvp',true));
    r.save('new','Title','platform','<script>Not HTML</script>',0,false); assert.equal(r.article('new'), undefined);
    r.save('new','Title','platform','<script>Not HTML</script>',1,true); assert.equal(r.article('new')?.state, 'published');
    assert.throws(() => r.save('new','Stale','platform','Body',1,true), /conflict/);
    const s = r.subscribe('a','a@example.test','https://example.test'); assert.equal(s.state,'pending'); assert.equal(r.subscribe('a','a@example.test','https://example.test').token,s.token);
    r.lifecycle(s.token,false); r.lifecycle(s.token,false); assert.equal(r.subscription('a')?.state,'confirmed');
    r.lifecycle(s.token,true); r.lifecycle(s.token,false); assert.equal(r.subscription('a')?.state,'unsubscribed');
    const fresh = r.subscribe('a','a@example.test','https://example.test'); assert.notEqual(fresh.token,s.token); assert.equal(r.byToken(s.token),undefined); assert.equal(r.subscription('b'),undefined);
  } finally { db.close(); }
});
