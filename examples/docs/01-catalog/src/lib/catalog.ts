export const books = [
  { id: 'field-notes', title: 'Field Notes', priceCents: 1800, stock: 6 },
  { id: 'night-trains', title: 'Night Trains', priceCents: 2450, stock: 0 },
];

export function usd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
  }).format(cents / 100);
}
