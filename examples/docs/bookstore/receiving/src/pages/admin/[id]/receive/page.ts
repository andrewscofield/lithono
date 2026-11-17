import { post, HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { requireUser } from 'lithono/auth';
import { z } from 'zod';
import { catalog, database } from '@/server/services.ts';
import { createReceiving } from '@/server/receiving.ts';
import { operation } from '@/server/operation.ts';
import { versionSchema } from '@/lib/product.ts';

const receiving = createReceiving(database);
export function loader(ctx: Loader) {
  const owner = requireUser(ctx).id;
  const book = catalog.one(owner, ctx.params.id);
  if (!book) throw new HttpError(404, 'Book not found');
  return { book, token: crypto.randomUUID(), receipts: receiving.list(owner, book.id) };
}
export const actions = {
  receive: post(z.object({
    version: versionSchema, token: z.uuid(), quantity: z.coerce.number().int().min(1).max(10000),
    reference: z.string().trim().min(1).max(160),
  }), ctx => {
    const owner = requireUser(ctx).id;
    const receipt = operation(() => receiving.receive(owner, ctx.params.id, ctx.input.version, ctx.input.token, ctx.input.quantity, ctx.input.reference));
    return { received: true, receipt };
  }),
};
