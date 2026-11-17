import { post, HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { z } from 'zod';
import { sqlite } from '@/server/db.ts';
import { requireWorkspace } from '@/server/workspace.ts';
import { createBookstore, BookstoreConflict } from '@/server/repositories/bookstore.ts';
import { productSchema } from '@/lib/bookstore/product.ts';

const catalog = createBookstore(sqlite);
export function loader(ctx: Loader) {
  const owner = requireWorkspace(ctx).id;
  catalog.seed(owner);
  const product = catalog.one(owner, ctx.params.id);
  if (!product) throw new HttpError(404, 'Book not found');
  return { product, token: crypto.randomUUID(), receipts: catalog.receipts(owner, product.id), publicURL: `/bookstore/shop/${encodeURIComponent(owner)}/${product.slug}` };
}
export const meta = ({ data }: { data: ReturnType<typeof loader> }) => ({ title: `${data.product.title} · Chapter House` });
const version = z.coerce.number().int().positive();
function domain<T>(work: () => T): T {
  try { return work(); }
  catch (error) { if (error instanceof BookstoreConflict) throw new HttpError(409, error.message); throw error; }
}
export const actions = {
  save: post(productSchema.extend({ version, published: z.enum(['draft', 'published']) }), ctx => {
    const owner = requireWorkspace(ctx).id;
    domain(() => catalog.save(owner, ctx.params.id, ctx.input.version, ctx.input, ctx.input.published === 'published'));
    return { saved: true };
  }),
  receive: post(z.object({ version, token: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(10000), reference: z.string().trim().min(1).max(160) }), ctx => {
    const owner = requireWorkspace(ctx).id;
    const receipt = domain(() => catalog.receive(owner, ctx.params.id, ctx.input.version, ctx.input.token, ctx.input.quantity, ctx.input.reference));
    return { received: true, receipt };
  }),
};
