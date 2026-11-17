import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../src/server/database.ts';
import { createCatalog } from '../src/server/catalog.ts';
import { createCatalogWriter, CatalogConflict } from '../src/server/catalog-write.ts';

test('draft writes reject another owner, duplicate keys and stale versions', () => {
  const database = openCatalog(':memory:');
  try {
    const catalog = createCatalog(database);
    const writer = createCatalogWriter(database);
    const input = { title: 'New book', author: 'A. Reader', sku: 'ONE', slug: 'new-book', description: 'A fictional book for testing.', priceCents: 1800 };
    const book = writer.create('a', input);
    assert.equal(book.stock, 0);
    assert.equal(catalog.published('a', book.slug), undefined);
    assert.throws(() => writer.create('a', input), CatalogConflict);
    assert.throws(() => writer.save('b', book.id, book.version, input), CatalogConflict);
    writer.save('a', book.id, book.version, { ...input, title: 'Edited title' });
    assert.throws(() => writer.save('a', book.id, book.version, input), CatalogConflict);
    assert.equal(catalog.one('a', book.id)?.title, 'Edited title');
  } finally { database.close(); }
});
