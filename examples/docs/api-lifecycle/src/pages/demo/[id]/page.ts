import type { Loader } from 'lithono';
import { loader as demoLoader, actions as demoActions } from '@/pages/page.ts';

export const hydrate = true;
export function loader(ctx: Loader) { return demoLoader(ctx); }
export const actions = demoActions;
