import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../src/server/database.ts';
import { createCatalog } from '../src/server/catalog.ts';
import { createCatalogWriter } from '../src/server/catalog-write.ts';

test('publication controls public reads independently of stock', () => {
  const database = openCatalog(':memory:');
  try {
    const catalog = createCatalog(database); catalog.seed('a');
    const writer = createCatalogWriter(database);
    const draft = catalog.list('a').find(book => !book.published)!;
    writer.save('a', draft.id, draft.version, draft, true);
    assert.equal(catalog.published('a', draft.slug)?.stock, 0);
    assert.equal(catalog.published('b', draft.slug), undefined);
    writer.save('a', draft.id, draft.version + 1, draft, false);
    assert.equal(catalog.published('a', draft.slug), undefined);
  } finally { database.close(); }
});
