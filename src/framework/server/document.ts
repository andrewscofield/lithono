/**
 * Document pieces for the response writer. Lit SSR is buffered in render.ts
 * before shell.ts writes these pieces; this is not progressive SSR.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { LithonoData } from '../types.ts';
import type { ResolvedAssets } from './assets.ts';
import { productionDocument } from './production.ts';

/** Escape text that will sit in an HTML attribute or text node. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** JSON for a `<script>` tag: escape `<` so `</script>` cannot break out of the payload. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

const CSS_IMPORT = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?\s*;/g;

/** Inline relative `@import`s so a `<style>` tag does not depend on the CSS file URL. */
function readCssFile(file: string, seen: Set<string>): string {
  const abs = resolve(file);
  if (seen.has(abs) || !existsSync(abs)) return '';
  seen.add(abs);
  const text = readFileSync(abs, 'utf8');
  return text.replace(CSS_IMPORT, (original, spec: string) => {
    if (!spec.startsWith('.') && !spec.startsWith('/')) return original;
    const target = spec.startsWith('/')
      ? resolve(process.cwd(), spec.replace(/^\//, ''))
      : resolve(dirname(abs), spec);
    return readCssFile(target, seen);
  });
}

/** Concatenate stylesheet files from disk so they can be inlined into `<style>`. */
export function readCssFiles(hrefs: string[], root = process.cwd()): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const href of hrefs) {
    const rel = href.replace(/^\//, '');
    const candidates = [resolve(root, rel), resolve(root, href)];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      try {
        parts.push(readCssFile(file, seen));
        break;
      } catch {
        // skip unreadable files; the `<link>` fallback still loads them
      }
    }
  }
  return parts.join('\n');
}

/** Fallback envelope when the app has no `src/app.html`. */
export const DEFAULT_APP_HTML = `<!DOCTYPE html>
<html lang="{{lang}}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--lithono:meta-->
  <!--lithono:head-->
</head>
<body>
<div id="app"><!--lithono:body--></div>
<!--lithono:data-->
</body>
</html>
`;

/** Prefer the project's `src/app.html`; otherwise the built-in envelope. */
export function loadAppHtml(root = process.cwd()): string {
  if (import.meta.env?.PROD) {
    if (!productionDocument.envelope) throw new Error('Lithono: missing built document envelope');
    return productionDocument.envelope;
  }
  const file = resolve(root, 'src/app.html');
  if (existsSync(file)) return readFileSync(file, 'utf8');
  return DEFAULT_APP_HTML;
}

/**
 * Boot payload and module tags written at `<!--lithono:data-->`.
 * The client reads `#__LITHONO_DATA__` then imports `assets.bootstrap`.
 */
export function documentDataAndScripts(data: LithonoData, assets: ResolvedAssets, importScript?: string): string {
  const dev = import.meta.env.DEV === true;
  const scripts = [
    ...assets.scripts.map((src) => `  <script type="module" src="${escapeHtml(src)}"></script>`),
    `  <script type="module" src="${escapeHtml(assets.bootstrap)}"></script>`,
  ];
  const inlineImport =
    importScript && !dev ? `  <script type="module">${importScript}</script>` : scripts.join('\n');
  return `  <script id="__LITHONO_DATA__" type="application/json">${jsonForScript(data)}</script>\n${inlineImport}`;
}
