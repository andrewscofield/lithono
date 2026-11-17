import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '@/server/database.ts';
import { CatalogConflict } from '@/server/catalog-write.ts';

export interface Receipt { id: string; book_id: string; quantity: number; reference: string; created_at: number }

export function createReceiving(database: DatabaseSync) {
  database.exec(`CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, book_id TEXT NOT NULL REFERENCES books(id),
    token TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), reference TEXT NOT NULL,
    created_at INTEGER NOT NULL, UNIQUE(owner, token)
  )`);
  return {
    list(owner: string, bookId: string) {
      return database.prepare('SELECT * FROM receipts WHERE owner = ? AND book_id = ? ORDER BY created_at DESC, id DESC')
        .all(owner, bookId) as unknown as Receipt[];
    },
    receive(owner: string, bookId: string, version: number, token: string, quantity: number, reference: string) {
      return transaction(database, () => {
        const previous = database.prepare('SELECT * FROM receipts WHERE owner = ? AND token = ?').get(owner, token) as Receipt | undefined;
        if (previous) {
          if (previous.book_id !== bookId || previous.quantity !== quantity || previous.reference !== reference)
            throw new CatalogConflict('This receipt token was used with different details. Reload for a new delivery.');
          return previous;
        }
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new CatalogConflict('Receive between 1 and 10,000 copies.');
        const result = database.prepare(`UPDATE books SET stock = stock + ?, version = version + 1
          WHERE owner = ? AND id = ? AND version = ? AND stock + ? <= 1000000`)
          .run(quantity, owner, bookId, version, quantity);
        if (!result.changes) throw new CatalogConflict('Stock changed or exceeded the limit. Compare current stock and reload before trying again.');
        const receipt = { id: crypto.randomUUID(), book_id: bookId, quantity, reference, created_at: Date.now() };
        database.prepare('INSERT INTO receipts VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(receipt.id, owner, bookId, token, quantity, reference, receipt.created_at);
        return receipt;
      });
    },
  };
}
