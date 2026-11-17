import type { Loader } from 'lithono';
import { sqlite } from '@/server/db.ts';
import { createBookstore } from '@/server/repositories/bookstore.ts';
export const hydrate = false;
export const meta = () => ({ title: 'The shop · Chapter House' });
export function loader({ params, url }: Loader) {
  const catalog = createBookstore(sqlite);
  if (params.store === 'chapter-house') catalog.seed('chapter-house');
  const search = (url.searchParams.get('q') ?? '').slice(0, 200);
  return { products: catalog.list(params.store, search, true), search, store: params.store };
}
