import type { DatabaseSync } from 'node:sqlite';
import type { Book } from '@/server/catalog.ts';
import { createCatalog } from '@/server/catalog.ts';
import { transaction } from '@/server/database.ts';

export class CatalogConflict extends Error {}
export type ProductInput = Pick<Book, 'title' | 'author' | 'sku' | 'slug' | 'description' | 'priceCents'>;

export function createCatalogWriter(database: DatabaseSync) {
  const catalog = createCatalog(database);
  function unique(owner: string, input: ProductInput, except = '') {
    if (database.prepare('SELECT 1 FROM books WHERE owner = ? AND id != ? AND (slug = ? OR sku = ?)')
      .get(owner, except, input.slug, input.sku)) throw new CatalogConflict('That SKU or slug already exists in your catalog.');
  }
  return {
    create(owner: string, input: ProductInput) {
      return transaction(database, () => {
        unique(owner, input);
        const id = crypto.randomUUID();
        database.prepare('INSERT INTO books VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1)')
          .run(id, owner, input.slug, input.sku, input.title, input.author, input.description, input.priceCents);
        return catalog.one(owner, id)!;
      });
    },
    save(owner: string, id: string, version: number, input: ProductInput, published = false) {
      transaction(database, () => {
        unique(owner, input, id);
        const result = database.prepare(`UPDATE books SET slug = ?, sku = ?, title = ?, author = ?,
          description = ?, price_cents = ?, published = ?, version = version + 1
          WHERE owner = ? AND id = ? AND version = ?`)
          .run(input.slug, input.sku, input.title, input.author, input.description, input.priceCents, published ? 1 : 0, owner, id, version);
        if (!result.changes) throw new CatalogConflict('This book changed. Compare the current record in another tab, then reload before reapplying your edit.');
      });
    },
  };
}
