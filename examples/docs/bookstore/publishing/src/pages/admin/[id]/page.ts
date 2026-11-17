import { post, HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { requireUser } from 'lithono/auth';
import { z } from 'zod';
import { catalog, database } from '@/server/services.ts';
import { createCatalogWriter } from '@/server/catalog-write.ts';
import { operation } from '@/server/operation.ts';
import { productSchema, versionSchema } from '@/lib/product.ts';

const writer = createCatalogWriter(database);
export function loader(ctx: Loader) {
  const book = catalog.one(requireUser(ctx).id, ctx.params.id);
  if (!book) throw new HttpError(404, 'Book not found');
  return { book, publicURL: `/shop/${encodeURIComponent(book.owner)}/${book.slug}` };
}
export const actions = {
  save: post(productSchema.extend({ version: versionSchema, visibility: z.enum(['draft', 'published']) }), ctx => {
    const owner = requireUser(ctx).id;
    operation(() => writer.save(owner, ctx.params.id, ctx.input.version, ctx.input, ctx.input.visibility === 'published'));
    return { saved: true };
  }),
};
