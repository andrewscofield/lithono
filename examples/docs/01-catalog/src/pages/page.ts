import { books, usd } from '@/lib/catalog.ts';

export function loader() {
  return { books: books.map(book => ({ ...book, price: usd(book.priceCents) })) };
}

export const meta = () => ({ title: 'Chapter House · Catalog checkpoint' });
