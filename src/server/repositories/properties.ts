import type { DatabaseSync } from 'node:sqlite';
import type { Listing } from '../db.ts';
import { propertyPageSize, propertyQuery, type PropertyQuery } from '../../lib/property-query.ts';
import { seedOnce } from '../database/seeds.ts';
import { transaction } from '../database/migrations.ts';
import { createEmailOutbox } from './email-outbox.ts';

export interface Property extends Listing {
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  area: number | null;
  listed_at: number;
  image: string | null;
}
const columns = 'id, address, price, kind, status, featured, description, location, latitude, longitude, bedrooms, area, listed_at, image';
export class InquiryConflictError extends Error {}
const project = (row: unknown): Property => {
  const value = row as Property;
  return { ...value, featured: Boolean(value.featured) };
};

export function seedProperties(database: DatabaseSync, now = Date.now()) {
  seedOnce(database, 'property-explorer', 'shared', 1, () => {
    const towns = [
      ['Portland', 45.52, -122.68], ['Bend', 44.06, -121.31],
      ['Salem', 44.94, -123.04], ['Eugene', 44.05, -123.09], ['Astoria', 46.19, -123.83],
    ] as const;
    const streets = ['Cedar Lane', 'River Walk', 'Garden Avenue', 'Hill Road', 'Market Street'];
    const insert = database.prepare(`INSERT OR IGNORE INTO listings (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (let index = 0; index < 25; index++) {
      const [town, lat, lng] = towns[index % towns.length];
      const kind = (['house', 'apartment', 'land'] as const)[index % 3];
      insert.run(`explorer-${String(index + 1).padStart(2, '0')}`,
        `${100 + index * 7} ${streets[index % 5]}`, 125000 + index * 27500,
        kind, ['for-sale', 'for-sale', 'pending', 'sold'][index % 4], index % 7 === 0 ? 1 : 0,
        kind === 'land' ? `Open building plot near ${town}, with room for a garden. Verify zoning and services before purchase.`
          : `Light-filled ${kind} in ${town}, close to neighborhood shops and walking trails. Flexible living space and a quiet outlook.`,
        town, lat + Math.floor(index / 5) * 0.012, lng + Math.floor(index / 5) * 0.009,
        kind === 'land' ? null : 1 + index % 5, kind === 'land' ? 800 + index * 90 : 65 + index * 8,
        now - index * 86400000, `/assets/images/property-${kind}.svg`);
    }
  });
}

export function createPropertyRepository(database: DatabaseSync) {
  return {
    get(id: string): Property | undefined {
      const row = database.prepare(`SELECT ${columns} FROM listings WHERE id = ?`).get(id);
      return row ? project(row) : undefined;
    },
    search(input: string | URL | URLSearchParams) {
      const query = propertyQuery.read(input);
      const predicates: string[] = [];
      const args: (string | number)[] = [];
      if (query.q.trim()) {
        predicates.push("(address LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\')");
        const term = `%${query.q.trim().replace(/[\\%_]/g, '\\$&')}%`;
        args.push(term, term);
      }
      predicates.push('price >= ? AND price <= ?');
      args.push(query.min, query.max);
      for (const key of ['kind', 'status'] as const) {
        if (query[key] !== 'all') { predicates.push(`${key} = ?`); args.push(query[key]); }
      }
      const where = predicates.join(' AND ');
      const total = (database.prepare(`SELECT COUNT(*) AS n FROM listings WHERE ${where}`).get(...args) as { n: number }).n;
      const pages = Math.max(1, Math.ceil(total / propertyPageSize));
      const page = Math.min(query.page, pages);
      const order: Record<PropertyQuery['sort'], string> = {
        recent: 'listed_at DESC, id ASC', 'price-asc': 'price ASC, id ASC',
        'price-desc': 'price DESC, id ASC', address: 'address COLLATE NOCASE ASC, id ASC',
      };
      const listings = database.prepare(`SELECT ${columns} FROM listings WHERE ${where} ORDER BY ${order[query.sort]} LIMIT ? OFFSET ?`)
        .all(...args, propertyPageSize, (page - 1) * propertyPageSize).map(project);
      return { listings, total, pages, query: { ...query, page } };
    },
    inquiry(workspaceId: string, listingId: string, key: string, email: string, message: string) {
      return transaction(database, () => {
        const old = database.prepare('SELECT id, listing_id, email, message, outbox_id FROM property_inquiries WHERE workspace_id = ? AND submission_key = ?')
          .get(workspaceId, key) as { id: string; listing_id: string; email: string; message: string; outbox_id: string } | undefined;
        if (old) {
          if (old.listing_id !== listingId || old.email !== email || old.message !== message) throw new InquiryConflictError('Submission key already used for a different inquiry');
          return old;
        }
        const listing = this.get(listingId);
        if (!listing) throw new Error('Listing not found');
        const id = crypto.randomUUID();
        // Receipt goes to the signed-in inquirer, not a fabricated agent address.
        const outbox = createEmailOutbox(database).enqueue(workspaceId, `property-inquiry:${id}`, {
          to: email, subject: `Inquiry recorded: ${listing.address}`,
          text: `Your inquiry about ${listing.address} has been recorded.\n\n${message}\n\nThis showcase does not contact a real property agent.`,
        });
        database.prepare('INSERT INTO property_inquiries VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, workspaceId, listingId, key, email, message, outbox.id, Date.now());
        return { id, outbox_id: outbox.id };
      });
    },
  };
}
