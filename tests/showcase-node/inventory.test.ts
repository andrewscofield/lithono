import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/server/database.ts';
import { createWorkspaceRepository } from '../../src/server/repositories/workspaces.ts';
import { createInventory } from '../../src/server/repositories/inventory.ts';
test('inventory adjustment/audit/version transaction and workspace isolation', () => {
  const db = openDatabase(':memory:');
  try {
    const repo = createInventory(db); for (const owner of ['a', 'b']) { createWorkspaceRepository(db).forUser(owner); repo.seed(owner); repo.seed(owner); }
    const item = repo.get('a', 'a-item-1')!; assert.equal(repo.get('b', item.id), undefined);
    assert.throws(() => repo.adjust('b', item.id, 1, 4, 5, 'Foreign'));
    repo.adjust('a', item.id, item.version, 10, 3, 'Receipt');
    assert.throws(() => repo.adjust('a', item.id, item.version, 20, 3, 'Stale'), /Conflict/);
    assert.equal(repo.get('a', item.id)?.stock, 10); assert.equal(repo.audit('a', item.id).length, 1); assert.equal(repo.audit('b', item.id).length, 0);
    assert.throws(() => repo.adjust('a', item.id, 2, -1, 3, 'Invalid')); assert.equal(repo.audit('a', item.id).length, 1);
  } finally { db.close(); }
});
