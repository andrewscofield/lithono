import { siteTitle } from '@/lib/starter.ts';

export function loader() {
  return { title: siteTitle };
}

export const meta = () => ({ title: siteTitle });
