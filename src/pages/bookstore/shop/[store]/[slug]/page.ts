import { HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { sqlite } from '@/server/db.ts';
import { createBookstore } from '@/server/repositories/bookstore.ts';
export const hydrate = false;
export function loader({ params }: Loader) {
  const catalog = createBookstore(sqlite);
  if (params.store === 'chapter-house') catalog.seed('chapter-house');
  const product = catalog.published(params.store, params.slug);
  if (!product) throw new HttpError(404, 'Published book not found');
  return { product, store: params.store };
}
export const meta = ({ data }: { data: ReturnType<typeof loader> }) => ({ title: `${data.product.title} · Chapter House`, description: data.product.description });
