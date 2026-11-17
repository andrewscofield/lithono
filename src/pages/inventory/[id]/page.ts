import { post, redirect, HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { adjustmentSchema } from '../page.ts';
import { createInventory } from '../../../server/repositories/inventory.ts';
import { sqlite } from '../../../server/db.ts';
import { requireWorkspace } from '../../../server/workspace.ts';
export function loader(ctx: Loader) {
  const owner = requireWorkspace(ctx).id; const repo = createInventory(sqlite); const item = repo.get(owner, ctx.params.id);
  if (!item) throw new HttpError(404, 'Item not found');
  return { item, audit: repo.audit(owner, item.id) };
}
export const actions = { adjust: post(adjustmentSchema, ctx => {
  const owner = requireWorkspace(ctx).id;
  if (ctx.input.id !== ctx.params.id) throw new HttpError(400, 'Item mismatch');
  try { createInventory(sqlite).adjust(owner, ctx.params.id, ctx.input.version, ctx.input.stock, ctx.input.threshold, ctx.input.reason); }
  catch (e) { throw new HttpError(409, (e as Error).message); }
  redirect(`/inventory/${encodeURIComponent(ctx.params.id)}`);
}) };
