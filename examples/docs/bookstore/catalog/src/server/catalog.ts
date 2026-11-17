import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '@/server/database.ts';

export interface Book {
  id: string; owner: string; slug: string; sku: string; title: string; author: string;
  description: string; priceCents: number; stock: number; published: number; version: number;
}

const columns = 'id, owner, slug, sku, title, author, description, price_cents AS priceCents, stock, published, version';

export function createCatalog(database: DatabaseSync) {
  return {
    seed(owner: string) {
      transaction(database, () => {
        if (database.prepare('SELECT 1 FROM catalog_seeds WHERE owner = ?').get(owner)) return;
        const insert = database.prepare('INSERT INTO books VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
        insert.run(crypto.randomUUID(), owner, 'field-notes', 'CH-001', 'Field Notes', 'Ada Rivers', 'A fictional field guide to the everyday web.', 1800, 6, 1);
        insert.run(crypto.randomUUID(), owner, 'night-trains', 'CH-002', 'Night Trains', 'Morgan Vale', 'A fictional illustrated journey through quiet stations.', 2450, 0, 0);
        database.prepare('INSERT INTO catalog_seeds VALUES (?)').run(owner);
      });
    },
    list(owner: string, publishedOnly = false) {
      return (database.prepare(`SELECT ${columns} FROM books WHERE owner = ? ORDER BY title`).all(owner) as unknown as Book[])
        .filter(book => !publishedOnly || book.published === 1);
    },
    one(owner: string, id: string) {
      return database.prepare(`SELECT ${columns} FROM books WHERE owner = ? AND id = ?`).get(owner, id) as Book | undefined;
    },
    published(owner: string, slug: string) {
      return database.prepare(`SELECT ${columns} FROM books WHERE owner = ? AND slug = ? AND published = 1`).get(owner, slug) as Book | undefined;
    },
  };
}
