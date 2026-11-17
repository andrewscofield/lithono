import { HttpError, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { articles, groups } from 'virtual:lithono-docs';
export const hydrate = false;
export function loader({ params }: Loader) {
  if (params.slug === 'getting-started') redirect('/docs/installation');
  const article = articles.find(article => article.id === params.slug);
  if (!article) throw new HttpError(404, 'Documentation not found');
  const ordered = groups.flatMap(group => group.articles);
  const index = ordered.findIndex(item => item.id === article.id);
  const { id, title, description, section, html, headings } = article;
  return { article: { id, title, description, section, html, headings }, previous: ordered[index - 1] ?? null, next: ordered[index + 1] ?? null };
}
export function meta({ data }: { data: ReturnType<typeof loader> }) { return { title: `${data.article.title} · Lithono`, description: data.article.description }; }
