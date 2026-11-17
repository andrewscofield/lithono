import { HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { catalog } from '@/server/services.ts';
import { usd } from '@/lib/money.ts';

export function loader({ params }: Loader) {
  const book = catalog.published(params.store, params.slug);
  if (!book) throw new HttpError(404, 'Book not found');
  return { book, price: usd(book.priceCents) };
}
export const meta = ({ data }: { data: ReturnType<typeof loader> }) => ({ title: `${data.book.title} · Chapter House` });
