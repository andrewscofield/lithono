import { post, redirect, HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { z } from 'zod';
import { sqlite } from '../../../server/db.ts';
import { createCommunity } from '../../../server/repositories/community.ts';
import { requireWorkspace } from '../../../server/workspace.ts';
export const hydrate = false;
export function loader(ctx: Loader) {
  const repo = createCommunity(sqlite); const article = repo.article(ctx.params.id);
  if (!article) throw new HttpError(404, 'Publication not found');
  const marks = ctx.user ? repo.marks(ctx.user.id, article.id) : [];
  return { article, paragraphs: article.body.split(/\r?\n(?:\r?\n)+/), bookmarked: marks.includes('bookmark'), rsvp: marks.includes('rsvp') };
}
export const actions = { mark: post(z.object({ kind: z.enum(['bookmark','rsvp']), enabled: z.enum(['yes','no']) }), ctx => {
  const owner = requireWorkspace(ctx).id;
  try { createCommunity(sqlite).mark(owner, ctx.params.id, ctx.input.kind, ctx.input.enabled === 'yes'); }
  catch { throw new HttpError(400, 'Publication action unavailable'); }
  redirect(`/community/${ctx.params.id}`);
}) };
