import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '@/server/database/migrations.ts';
import { createWorkspaceRepository } from '@/server/repositories/workspaces.ts';

export interface BookProduct {
  id: string; workspace_id: string; slug: string; sku: string; title: string; author: string;
  description: string; price: number; stock: number; published: number; version: number;
}
export interface StockReceipt { id: string; product_id: string; quantity: number; reference: string; created_at: number }
export class BookstoreConflict extends Error {}
export type ProductInput = Pick<BookProduct, 'title' | 'author' | 'sku' | 'slug' | 'description' | 'price'>;

/** Application domain code: the framework does not decide stock or publication rules. */
export function createBookstore(database: DatabaseSync) {
  const one = (owner: string, id: string) => database.prepare('SELECT * FROM bookstore_products WHERE workspace_id = ? AND id = ?').get(owner, id) as BookProduct | undefined;
  const repo = {
    seed(owner: string) {
      transaction(database, () => {
        createWorkspaceRepository(database).forUser(owner);
        const seeded = database.prepare("SELECT 1 FROM showcase_seeds WHERE domain = 'bookstore' AND scope = ? AND version = 1").get(owner);
        if (seeded) return;
        const insert = database.prepare('INSERT INTO bookstore_products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
        insert.run(crypto.randomUUID(), owner, 'the-native-web', 'CH-001', 'The Native Web', 'Ada Rivers', 'A practical field guide to links, forms, and the browser platform. A fictional Chapter House title.', 2400, 8, 1);
        insert.run(crypto.randomUUID(), owner, 'gardens-after-rain', 'CH-002', 'Gardens After Rain', 'Sam Orchard', 'Essays on small gardens and changing seasons. A fictional Chapter House title.', 1800, 3, 1);
        insert.run(crypto.randomUUID(), owner, 'night-trains', 'CH-003', 'Night Trains', 'Morgan Vale', 'An illustrated journey through quiet stations. Draft product ready for staff to receive and publish.', 2200, 0, 0);
        database.prepare("INSERT INTO showcase_seeds VALUES ('bookstore', ?, 1, ?)").run(owner, Date.now());
      });
    },
    list(owner: string, search = '', publishedOnly = false) {
      return (database.prepare('SELECT * FROM bookstore_products WHERE workspace_id = ? ORDER BY title').all(owner) as unknown as BookProduct[])
        .filter(product => (!publishedOnly || product.published === 1) && `${product.title} ${product.author} ${product.sku}`.toLowerCase().includes(search.toLowerCase()));
    },
    one,
    published(owner: string, slug: string) {
      return database.prepare('SELECT * FROM bookstore_products WHERE workspace_id = ? AND slug = ? AND published = 1').get(owner, slug) as BookProduct | undefined;
    },
    create(owner: string, input: ProductInput) {
      return transaction(database, () => {
        if (database.prepare('SELECT 1 FROM bookstore_products WHERE workspace_id = ? AND (slug = ? OR sku = ?)').get(owner, input.slug, input.sku)) throw new BookstoreConflict('That SKU or URL slug already exists in your store.');
        const id = crypto.randomUUID();
        database.prepare('INSERT INTO bookstore_products VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1)').run(id, owner, input.slug, input.sku, input.title, input.author, input.description, input.price);
        return one(owner, id)!;
      });
    },
    save(owner: string, id: string, version: number, input: ProductInput, published: boolean) {
      transaction(database, () => {
        const duplicate = database.prepare('SELECT 1 FROM bookstore_products WHERE workspace_id = ? AND id != ? AND (slug = ? OR sku = ?)').get(owner, id, input.slug, input.sku);
        if (duplicate) throw new BookstoreConflict('That SKU or URL slug already exists in your store.');
        const result = database.prepare('UPDATE bookstore_products SET slug = ?, sku = ?, title = ?, author = ?, description = ?, price = ?, published = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?')
          .run(input.slug, input.sku, input.title, input.author, input.description, input.price, published ? 1 : 0, owner, id, version);
        if (!result.changes) throw new BookstoreConflict('This product changed. Your submitted values are preserved below. Open the current product in another tab to compare, then reload before reapplying your edit.');
      });
    },
    receive(owner: string, id: string, version: number, token: string, quantity: number, reference: string) {
      return transaction(database, () => {
        const previous = database.prepare('SELECT * FROM bookstore_movements WHERE workspace_id = ? AND token = ?').get(owner, token) as (StockReceipt & { token: string }) | undefined;
        if (previous) {
          if (previous.product_id !== id || previous.quantity !== quantity || previous.reference !== reference) throw new BookstoreConflict('This receipt token has already been used with different details. Reload for a new delivery.');
          return previous;
        }
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new BookstoreConflict('Receive between 1 and 10,000 copies.');
        const result = database.prepare('UPDATE bookstore_products SET stock = stock + ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ? AND stock + ? <= 1000000').run(quantity, owner, id, version, quantity);
        if (!result.changes) throw new BookstoreConflict('Stock changed or the stock limit was exceeded. Your delivery has not been recorded. Compare the current stock and reload before trying again.');
        const receipt = { id: crypto.randomUUID(), product_id: id, quantity, reference, created_at: Date.now() };
        database.prepare('INSERT INTO bookstore_movements VALUES (?, ?, ?, ?, ?, ?, ?)').run(receipt.id, owner, id, token, quantity, reference, receipt.created_at);
        return receipt;
      });
    },
    receipts(owner: string, id: string) {
      return database.prepare('SELECT * FROM bookstore_movements WHERE workspace_id = ? AND product_id = ? ORDER BY created_at DESC, id DESC').all(owner, id) as unknown as StockReceipt[];
    },
  };
  return repo;
}
