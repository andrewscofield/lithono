import { post, redirect, HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { sqlite } from '@/server/db.ts';
import { requireWorkspace } from '@/server/workspace.ts';
import { createBookstore, BookstoreConflict } from '@/server/repositories/bookstore.ts';
import { productSchema } from '@/lib/bookstore/product.ts';
export const meta = () => ({ title: 'Catalog · Chapter House' });
const catalog = createBookstore(sqlite);
export function loader(ctx: Loader) {
  const owner = requireWorkspace(ctx).id;
  catalog.seed(owner);
  const search = (ctx.url.searchParams.get('q') ?? '').slice(0, 200);
  return { products: catalog.list(owner, search), search, shop: `/bookstore/shop/${encodeURIComponent(owner)}` };
}
export const actions = {
  create: post(productSchema, ctx => {
    const owner = requireWorkspace(ctx).id;
    catalog.seed(owner);
    try { const product = catalog.create(owner, ctx.input); redirect(`/bookstore/admin/${product.id}`); }
    catch (error) { if (error instanceof BookstoreConflict) throw new HttpError(409, error.message); throw error; }
  }),
};
