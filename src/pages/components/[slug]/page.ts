import { HttpError } from 'lithono';
import type { Loader } from 'lithono';
import { componentCatalogue } from '../../../server/repositories/components.ts';
import { renderCode } from '../../../server/code-highlight.ts';
export const hydrate = true;
export const meta = ({ data }: { data: Awaited<ReturnType<typeof loader>> }) => ({ title: `${data.example.name} · Component directory` });
export async function loader({ params, url }: Loader) {
  const example = componentCatalogue.find(item => item.slug === params.slug);
  if (!example) throw new HttpError(404, 'Component example not found');
  return {
    example: { ...example, sources: await Promise.all(example.sources.map(async source => ({ ...source, html: await renderCode(source.code, source.name.endsWith('.css') ? 'css' : source.name.endsWith('.html') ? 'html' : 'typescript', source.name, false) }))) },
    installHTML: await renderCode(example.install, 'shell', 'Install', false),
    snippetHTML: await renderCode(example.snippet, example.slug === 'static-banner' ? 'html' : 'typescript', 'Import and use', false),
    isStatic: example.slug === 'static-banner',
    manual: url.searchParams.get('activation') === 'manual',
  };
}
