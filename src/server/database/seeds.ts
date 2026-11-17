import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './migrations.ts';

/** Domain seeds must insert only within scope; reset belongs to the domain repository. */
export function seedOnce(
  database: DatabaseSync,
  domain: string,
  scope: string,
  version: number,
  seed: () => void,
): boolean {
  return transaction(database, () => {
    if (database.prepare('SELECT 1 FROM showcase_seeds WHERE domain = ? AND scope = ? AND version = ?')
      .get(domain, scope, version)) return false;
    seed();
    database.prepare('INSERT INTO showcase_seeds VALUES (?, ?, ?, ?)')
      .run(domain, scope, version, Date.now());
    return true;
  });
}

export function seedLegacyDemos(database: DatabaseSync): void {
  seedOnce(database, 'legacy-demos', 'shared', 1, () => {
    const count = (table: string) => (database.prepare(`SELECT COUNT(*) AS n FROM ${table}`)
      .get() as { n: number }).n;
    if (count('listings') === 0) {
      // Explicit columns allow later additive domain migrations.
      const listing = database.prepare(`INSERT INTO listings
        (id, address, price, kind, status, featured) VALUES (?, ?, ?, ?, ?, ?)`);
      listing.run('1', '123 Main Street', 450000, 'house', 'for-sale', 0);
      listing.run('2', '456 Oak Avenue', 325000, 'apartment', 'pending', 0);
      listing.run('3', '789 Pine Road', 510000, 'house', 'for-sale', 1);
    }
    if (count('lists') === 0) {
      const epoch = Date.UTC(2026, 0, 1);
      const list = database.prepare('INSERT INTO lists (id, name, created_at) VALUES (?, ?, ?)');
      const task = database.prepare(`INSERT INTO tasks
        (id, list_id, title, completed, created_at) VALUES (?, ?, ?, ?, ?)`);
      list.run('weekend', 'Weekend', epoch - 2);
      list.run('work', 'Work', epoch - 1);
      task.run('groceries', 'weekend', 'Buy groceries', 0, epoch - 20);
      task.run('lawn', 'weekend', 'Mow the lawn', 0, epoch - 10);
      task.run('brief', 'work', 'Write the brief', 0, epoch - 30);
      task.run('call', 'work', 'Call the client', 1, epoch - 5);
    }
  });
}
