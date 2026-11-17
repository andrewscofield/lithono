import { post, HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { z } from 'zod';
import { sqlite } from '../../server/db.ts';
import { requireWorkspace } from '../../server/workspace.ts';
import { createInventory } from '../../server/repositories/inventory.ts';
import { inventoryQuery } from '../../lib/inventory-query.ts';
import '../../components/inventory-editor/inventory-editor.ts';
import '../../components/inventory-view/inventory-view.ts';
export const hydrate = true;
export const adjustmentSchema = z
  .object({
    id: z.string().min(1).max(200).describe('Inventory item ID'),
    version: z.coerce.number().int().positive().describe('Expected optimistic lock version'),
    stock: z.coerce.number().int().min(0).max(1000000).describe('Updated stock quantity on hand'),
    threshold: z.coerce.number().int().min(0).max(1000000).describe('Low-stock reorder threshold'),
    reason: z.string().trim().min(1).max(200).describe('Audit reason for the stock adjustment'),
  })
  .describe('Adjust stock quantity and reorder threshold for an inventory item');
export const actions = {
  adjust: post(adjustmentSchema, ctx => {
    const owner = requireWorkspace(ctx).id;
    let item;
    try { item = createInventory(sqlite).adjust(owner, ctx.input.id, ctx.input.version, ctx.input.stock, ctx.input.threshold, ctx.input.reason); }
    catch (e) { throw new HttpError(409, (e as Error).message); }
    return { saved: true, item, reason: ctx.input.reason };
  }).mcp({
    description: 'Adjust stock quantity and reorder threshold for an inventory item',
    annotations: { idempotentHint: true },
  }),
};
export function loader(ctx: Loader) {
  const owner = requireWorkspace(ctx).id; const repo = createInventory(sqlite); repo.seed(owner);
  const query = inventoryQuery.read(ctx.url.searchParams); const snapshot = repo.list(owner, query);
  return { ...snapshot, query, previous: `/inventory?${inventoryQuery.write(ctx.url, { page: Math.max(1, snapshot.page - 1) })}`, next: `/inventory?${inventoryQuery.write(ctx.url, { page: snapshot.page + 1 })}` };
}
