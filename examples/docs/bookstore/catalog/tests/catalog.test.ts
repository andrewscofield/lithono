import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../src/server/database.ts';
import { createCatalog } from '../src/server/catalog.ts';

test('opening data is seeded once, owner scoped, and drafts stay private', () => {
  const database = openCatalog(':memory:');
  try {
    const catalog = createCatalog(database);
    catalog.seed('a'); catalog.seed('a'); catalog.seed('b');
    assert.equal(catalog.list('a').length, 2);
    assert.equal(catalog.list('a', true).length, 1);
    const draft = catalog.list('a').find(book => !book.published)!;
    assert.equal(catalog.one('b', draft.id), undefined);
    assert.equal(catalog.published('a', draft.slug), undefined);
  } finally { database.close(); }
});
