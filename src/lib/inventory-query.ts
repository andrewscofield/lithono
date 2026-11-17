import { defineQuery, query } from 'lithono/url';
export const inventoryQuery = defineQuery({ q: query.string({ validate: v => v.length <= 100 }), status: query.enum(['all', 'low'], { default: 'all' }), sort: query.enum(['sku', 'stock'], { default: 'sku' }), page: query.integer({ default: 1, min: 1 }) });
