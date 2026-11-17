import { stream } from 'hono/streaming';
import type { Context } from 'hono';
import type { InlinePolicy, LithonoData, PageMeta } from '../types.ts';
import type { ResolvedAssets } from './assets.ts';
import { productionDocument } from './production.ts';
import {
  DEFAULT_APP_HTML,
  documentDataAndScripts,
  escapeHtml,
  loadAppHtml,
  readCssFiles,
} from './document.ts';

function headMarkup(
  meta: PageMeta,
  assets: ResolvedAssets,
  inline: InlinePolicy
): string {
  const description = meta.description
    ? `  <meta name="description" content="${escapeHtml(meta.description)}">\n`
    : '';
  const title = `  <title>${escapeHtml(meta.title)}</title>\n`;
  const styles: string[] = [];
  const linked = new Set(assets.linkedStylesheets ?? []);
  const inlineHrefs = assets.stylesheets.filter((href) => !linked.has(href));
  if (inline !== 'none') {
    const routeCss = import.meta.env.PROD
      ? inlineHrefs.map((href) => {
          const style = productionDocument.styles[href];
          if (!style) throw new Error(`Lithono: missing built CSS: ${href}`);
          return style.text;
        }).join('\n')
      : readCssFiles(inlineHrefs);
    if (routeCss.trim()) styles.push(`  <style data-lithono-css>${routeCss}</style>`);
  }
  for (const href of assets.stylesheets.filter((href) => inline === 'none' || linked.has(href))) {
    styles.push(`  <link rel="stylesheet" href="${escapeHtml(href)}">`);
  }
  const preloads = assets.modulePreloads
    .map((href) => `  <link rel="modulepreload" href="${escapeHtml(href)}">`)
    .join('\n');
  return `${title}${description}${styles.join('\n')}\n${preloads}`;
}

export function streamPageResponse(
  c: Context,
  options: {
    meta: PageMeta;
    chunks: string[];
    data: LithonoData;
    assets: ResolvedAssets;
    lang?: string;
    inline?: InlinePolicy;
    importScript?: string;
    envelope?: string;
  }
) {
  const {
    meta,
    chunks,
    data,
    assets,
    lang = 'en',
    inline = 'styles',
    importScript,
    envelope = loadAppHtml(),
  } = options;

  // Lit SSR is fully collected before this writer starts: buffered SSR.
  const enhanced = data.hydrate || data.elements.length > 0;
  const documentAssets = enhanced ? assets : { ...assets, modulePreloads: [], scripts: [] };

  c.header('Content-Type', 'text/html; charset=utf-8');

  return stream(c, async (s) => {
    const withLang = envelope.replaceAll('{{lang}}', escapeHtml(lang));
    const withHead = withLang
      .replace('<!--lithono:meta-->', headMarkup(meta, documentAssets, inline))
      .replace('<!--lithono:head-->', '');
    const marker = '<!--lithono:body-->';
    const bodyAt = withHead.indexOf(marker);
    const prefix = bodyAt === -1 ? withHead : withHead.slice(0, bodyAt);
    const rest = bodyAt === -1 ? '' : withHead.slice(bodyAt + marker.length);
    const dataAt = rest.indexOf('<!--lithono:data-->');
    const afterBody = dataAt === -1 ? rest : rest.slice(0, dataAt);
    const suffix = dataAt === -1 ? '' : rest.slice(dataAt + '<!--lithono:data-->'.length);

    await s.write(prefix);
    for (const chunk of chunks) {
      await s.write(chunk);
    }
    await s.write(afterBody);
    await s.write(documentDataAndScripts(data, assets, importScript));
    await s.write(suffix);
  });
}

export { DEFAULT_APP_HTML, loadAppHtml };
