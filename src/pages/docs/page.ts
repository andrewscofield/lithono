import { articles, groups } from 'virtual:lithono-docs';
import type { Loader } from 'lithono';
export const hydrate = false;
export const meta = () => ({ title: 'Documentation · Lithono', description: 'Build server-rendered applications with HTML, CSS, TypeScript and web components.' });
export function loader({ url }: Loader) {
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length ? articles.filter(article => terms.every(term => `${article.title} ${article.description} ${article.search}`.toLowerCase().includes(term))).map(({ id, title, description, section }) => ({ id, title, description, section })) : [];
  return { groups, query, results, searching: terms.length > 0 };
}
