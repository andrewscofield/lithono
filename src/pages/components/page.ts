import type { Loader } from 'lithono';
import { searchComponents } from '../../server/repositories/components.ts';
export const hydrate = true;
export const meta = () => ({ title: 'Component directory · Lithono' });
export function loader({ request }: Loader) { return searchComponents(request.url); }
