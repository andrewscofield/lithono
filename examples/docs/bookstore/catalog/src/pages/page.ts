import { catalog } from '@/server/services.ts';
import { usd } from '@/lib/money.ts';

export function loader() {
  catalog.seed('chapter-house');
  return { books: catalog.list('chapter-house', true).map(book => ({ ...book, price: usd(book.priceCents) })) };
}
export const meta = () => ({ title: 'Chapter House · Database catalog' });
