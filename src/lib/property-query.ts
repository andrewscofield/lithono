import { defineQuery, query } from 'lithono/url';

export const propertyQuery = defineQuery({
  q: query.string({ validate: value => value.length <= 200, description: 'Free-text search across address, city, and listing notes' }),
  min: query.integer({ default: 0, min: 0, max: 1000000000, description: 'Minimum listing price' }),
  max: query.integer({ default: 1000000000, min: 0, max: 1000000000, description: 'Maximum listing price' }),
  kind: query.enum(['all', 'house', 'apartment', 'land'], { default: 'all', description: 'Property type filter' }),
  status: query.enum(['all', 'for-sale', 'pending', 'sold'], { default: 'all', description: 'Market status filter' }),
  sort: query.enum(['recent', 'price-asc', 'price-desc', 'address'], { default: 'recent', description: 'Result sort order' }),
  page: query.integer({ default: 1, min: 1, max: 1000000, description: '1-based pagination page number' }),
  view: query.enum(['list', 'map'], { default: 'list', description: 'Presentation layout mode' }),
}, { description: 'Filter, sort, and paginate property listings' });
export type PropertyQuery = ReturnType<typeof propertyQuery.read>;
export const propertyPageSize = 6;
export function propertyHref(input: string | URL, patch: Partial<PropertyQuery>) {
  return `/listings?${propertyQuery.write(input, patch)}`;
}
