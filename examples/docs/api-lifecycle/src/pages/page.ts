import { post } from 'lithono';
import type { Loader } from 'lithono';
import { z } from 'zod';
import { database } from '@/server/services.ts';
import { demoQuery } from '@/lib/demo-query.ts';

database.exec('CREATE TABLE IF NOT EXISTS api_demo (id INTEGER PRIMARY KEY, count INTEGER NOT NULL, fail_refresh INTEGER NOT NULL)');
database.prepare('INSERT OR IGNORE INTO api_demo VALUES (1, 0, 0)').run();

export const hydrate = true;
export function loader(ctx: Loader) {
  const row = database.prepare('SELECT count, fail_refresh FROM api_demo WHERE id = 1').get() as { count: number; fail_refresh: number };
  if (ctx.request.method === 'POST' && row.fail_refresh) throw new Error('Deliberate example: mutation committed, loader refresh failed');
  return { count: row.count, page: demoQuery.read(ctx.url).page };
}
export const actions = {
  commit: post(z.object({ mode: z.enum(['ok', 'refresh-fails']) }), ({ input }) => {
    database.prepare('UPDATE api_demo SET count = count + 1, fail_refresh = ? WHERE id = 1').run(input.mode === 'refresh-fails' ? 1 : 0);
    return { committed: true };
  }),
};
