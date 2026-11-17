import type { Loader } from 'lithono';
import { labelFor } from '../../lib/schemas/auth.ts';
import { sqlite } from '../../server/db.ts';
import { createPropertyRepository } from '../../server/repositories/properties.ts';
import { getProviderConfig } from '../../server/integrations/config.ts';

export const meta = () => ({ title: 'Listings · Lithono' });
export const hydrate = true;

export function loader({ request, user }: Loader) {
  const result = createPropertyRepository(sqlite).search(request.url);
  return {
    explorer: { ...result, map: getProviderConfig().map, href: request.url },
    total: result.total,
    page: result.query.page,
    pages: result.pages,
    listings: result.listings.map((listing) => ({
      ...listing,
      kindLabel: labelFor(listing.kind),
      statusLabel: labelFor(listing.status),
      priceLabel: `$${listing.price.toLocaleString()}`,
    })),
    user: user ? { id: user.id, email: user.email, name: user.name } : null,
  };
}
