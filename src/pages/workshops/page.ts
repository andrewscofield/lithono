import { sqlite } from '../../server/db.ts';
import { createWorkshops } from '../../server/repositories/workshops.ts';
export const meta = () => ({ title: 'Workshops · Lithono' });
export function loader() {
  return { sessions: createWorkshops(sqlite).catalog().map(s => ({ ...s, time: new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: s.zone }).format(s.starts_at), priceLabel: s.price ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: s.currency }).format(s.price / 100) : 'Free' })) };
}
