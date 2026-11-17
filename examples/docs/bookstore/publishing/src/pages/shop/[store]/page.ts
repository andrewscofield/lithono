import type { Loader } from 'lithono';
import { catalog } from '@/server/services.ts';
import { usd } from '@/lib/money.ts';

export function loader({ params }: Loader) {
  return { books: catalog.list(params.store, true).map(book => ({ ...book, price: usd(book.priceCents) })) };
}
export const meta = () => ({ title: 'Chapter House · Public shop' });
