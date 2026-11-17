import { createHighlighter } from 'shiki';

export const codeHighlighter = createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['typescript', 'javascript', 'html', 'css', 'shell', 'json', 'markdown'],
});
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const aliases: Record<string, string> = { ts: 'typescript', js: 'javascript', bash: 'shell', sh: 'shell', md: 'markdown' };
const labels: Record<string, string> = { typescript: 'TypeScript', javascript: 'JavaScript', html: 'HTML', css: 'CSS', shell: 'Shell', json: 'JSON', markdown: 'Markdown', text: 'Text' };

/** Shared by Markdown and showcase pages. The browser receives HTML, never Shiki. */
export async function renderCode(source: string, language: string, filename = '', wrapper = true) {
  const lang = aliases[language] ?? language;
  if (!Object.hasOwn(labels, lang)) throw new Error(`Unsupported code language: ${language}`);
  const engine = await codeHighlighter;
  const highlighted = engine.codeToHtml(source, { lang, themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false }).replace('<pre class="', '<pre class="source-code ');
  const content = `<div class="docs-code__bar"><span>${escape(filename || labels[lang])}</span><span class="docs-code__language">${escape(labels[lang])}</span><button type="button" data-copy disabled aria-label="Copy ${escape(filename || labels[lang])} code">Copy</button></div>${highlighted}<span class="docs-code__status" role="status" aria-live="polite"></span>`;
  return wrapper ? `<docs-code>${content}</docs-code>` : content;
}
