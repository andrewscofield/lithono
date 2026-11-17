import { post, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { requireUser } from 'lithono/auth';
import { catalog, database } from '@/server/services.ts';
import { createCatalogWriter } from '@/server/catalog-write.ts';
import { operation } from '@/server/operation.ts';
import { productSchema } from '@/lib/product.ts';

const writer = createCatalogWriter(database);
export function loader(ctx: Loader) {
  const user = requireUser(ctx);
  catalog.seed(user.id);
  return { name: user.name, owner: user.id, books: catalog.list(user.id) };
}
export const actions = {
  create: post(productSchema, ctx => {
    const owner = requireUser(ctx).id;
    const book = operation(() => writer.create(owner, ctx.input));
    redirect(`/admin/${book.id}`);
  }),
};
