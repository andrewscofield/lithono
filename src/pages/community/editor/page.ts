import { post, HttpError, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { z } from 'zod';
import { requireEditor } from '../../../server/workspace.ts';
import { createCommunity } from '../../../server/repositories/community.ts';
import { sqlite } from '../../../server/db.ts';
export const hydrate = false;
export function loader(ctx: Loader) {
  requireEditor(ctx); const repo = createCommunity(sqlite); const id = ctx.url.searchParams.get('edit');
  const item = id ? repo.article(id, true) : undefined;
  if (id && !item) throw new HttpError(404, 'Editorial record not found');
  return { posts: repo.list('', true), item: item ?? { id: crypto.randomUUID(), title: '', topic: 'platform', body: '', version: 0, state: 'draft' } };
}
export const actions = { save: post(z.object({ id: z.string().min(1).max(100), title: z.string().trim().min(1).max(150), topic: z.enum(['platform','events']), body: z.string().trim().min(1).max(10000), version: z.coerce.number().int().min(0), intent: z.enum(['save','publish']) }), ctx => {
  requireEditor(ctx);
  try { createCommunity(sqlite).save(ctx.input.id, ctx.input.title, ctx.input.topic, ctx.input.body, ctx.input.version, ctx.input.intent === 'publish'); }
  catch (e) { throw new HttpError(409, (e as Error).message); }
  redirect(`/community/editor?edit=${encodeURIComponent(ctx.input.id)}`);
}) };
