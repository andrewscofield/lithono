import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../database/migrations.ts';
import { seedOnce } from '../database/seeds.ts';
export interface Item { id: string; workspace_id: string; sku: string; name: string; category: string; stock: number; threshold: number; version: number }
export function createInventory(db: DatabaseSync) {
  const get = (owner: string, id: string) => db.prepare('SELECT * FROM inventory_items WHERE workspace_id = ? AND id = ?').get(owner, id) as unknown as Item | undefined;
  return {
    get,
    seed(owner: string) { seedOnce(db, 'inventory', owner, 1, () => {
      for (let i = 1; i <= 12; i++) db.prepare('INSERT INTO inventory_items VALUES (?,?,?,?,?,?,?,1)').run(`${owner}-item-${i}`, owner, `LAB-${String(i).padStart(3, '0')}`, `Workshop kit ${i}`, i % 2 ? 'Tools' : 'Materials', i % 4 === 0 ? 0 : i * 2, 5);
    }); },
    list(owner: string, query: { q: string; status: string; sort: string; page: number }) {
      const all = db.prepare('SELECT * FROM inventory_items WHERE workspace_id = ?').all(owner) as unknown as Item[];
      const rows = all.filter(i => `${i.name} ${i.sku} ${i.category}`.toLowerCase().includes(query.q.toLowerCase()) && (query.status !== 'low' || i.stock <= i.threshold));
      rows.sort((a,b) => (query.sort === 'stock' ? a.stock - b.stock : a.sku.localeCompare(b.sku)) || a.id.localeCompare(b.id));
      const pages = Math.max(1, Math.ceil(rows.length / 6)); const page = Math.min(query.page, pages);
      return { items: rows.slice((page - 1) * 6, page * 6), page, pages, total: rows.length };
    },
    adjust(owner: string, id: string, version: number, stock: number, threshold: number, reason: string) {
      return transaction(db, () => {
        const old = get(owner, id); if (!old) throw new Error('Item not found');
        if (old.version !== version) throw new Error('Conflict: stock changed. Reload current values, then reapply your intended adjustment.');
        if (![stock, threshold].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000) || !reason.trim() || reason.length > 200) throw new Error('Invalid stock, threshold or adjustment reason');
        db.prepare('UPDATE inventory_items SET stock = ?, threshold = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?').run(stock, threshold, owner, id, version);
        db.prepare('INSERT INTO inventory_audit VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), owner, id, stock - old.stock, reason.trim(), Date.now());
        return get(owner, id)!;
      });
    },
    audit(owner: string, id: string) { return db.prepare('SELECT delta, reason, created_at FROM inventory_audit WHERE workspace_id = ? AND item_id = ? ORDER BY created_at DESC LIMIT 20').all(owner, id) as { delta: number; reason: string; created_at: number }[]; },
  };
}
