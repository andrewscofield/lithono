import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { parse } from 'yaml';
import type { Root, Code } from 'mdast';
import type { Plugin } from 'vite';
import { renderCode } from '../src/server/code-highlight.ts';
import { compileHtml } from '../src/framework/compiler/html.ts';
import type { DocArticle, DocGroup, DocHeading } from '../src/lib/documentation.ts';

export const documentationSections = ['Get started', 'Learn Lithono', 'Guides', 'Coming from…', 'Styling', 'API reference'];
export const documentationOrder = ['introduction', 'installation', 'first-page', 'project-structure', 'bookstore', 'routing', 'loaders-actions', 'forms', 'components', 'url-state', 'rendering', 'tutorial-bookstore', 'tutorial-database', 'tutorial-accounts', 'tutorial-editing', 'tutorial-receiving', 'tutorial-publishing', 'tutorial-production', 'tutorial-checkpoints', 'executable-examples', 'receiving-stock', 'authentication', 'webmcp', 'testing', 'debugging', 'deployment', 'migration', 'lab-source', 'comparison', 'from-nextjs', 'from-tanstack-start', 'from-sveltekit', 'styling', 'design-system', 'dark-mode', 'tailwind', 'reference-routes', 'reference-actions', 'reference-elements', 'reference-controllers', 'reference-context', 'reference-forms', 'reference-navigation', 'reference-url-state', 'reference-server', 'reference-auth', 'reference-animation', 'reference-config'];
const text = (node: { value?: string; children?: unknown[] }): string => node.value ?? (node.children ?? []).map(child => text(child as Parameters<typeof text>[0])).join('');
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

/** Repository-authored Markdown only. Raw HTML is deliberately not enabled. */
export async function buildDocumentation(root: string, watch: (file: string) => void = () => {}) {
  const directory = resolve(root, 'content/docs');
  const files = readdirSync(directory).filter(file => file.endsWith('.md')).sort();
  const articles: DocArticle[] = [];
  const links: { from: string; href: string }[] = [];
  for (const file of files) {
    const path = resolve(directory, file);
    watch(path);
    const source = readFileSync(path, 'utf8');
    const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm);
    const tree = parser.parse(source) as Root;
    const frontmatter = tree.children.find(node => node.type === 'yaml');
    const meta = parse(frontmatter && 'value' in frontmatter ? frontmatter.value : '') as Record<string, unknown> | null;
    if (!meta || typeof meta.title !== 'string' || typeof meta.description !== 'string' || typeof meta.section !== 'string' || !documentationSections.includes(meta.section)) {
      throw new Error(`${file}: title, description and a known section are required`);
    }
    const id = file.replace(/\.md$/, '');
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`${file}: use a lowercase, hyphenated article ID`);
    const headings: DocHeading[] = [];
    const ids = new Set<string>();
    const codes: Code[] = [];
    const codeBlocks = new Map<Code, string>();
    visit(tree, 'heading', node => {
      if (node.depth === 1) throw new Error(`${file}: the page supplies its h1; start article headings at h2`);
      const title = text(node);
      const base = slug(title) || 'section';
      let headingId = base;
      let suffix = 2;
      while (ids.has(headingId)) headingId = `${base}-${suffix++}`;
      ids.add(headingId);
      node.data = { ...node.data, hProperties: { id: headingId } };
      headings.push({ id: headingId, title, depth: node.depth });
    });
    visit(tree, 'link', node => { links.push({ from: id, href: node.url }); });
    visit(tree, 'code', node => { codes.push(node); });
    for (const node of codes) {
      const include = node.meta?.match(/source="([^"]+)"/)?.[1];
      if (include) {
        // Fixed author-time paths, never request input. Keep secrets and private modules out.
        const publicLabFiles = ['src/pages/lab/page.ts', 'src/pages/lab/page.html', 'src/components/lab-controls/lab-controls.ts', 'src/components/lab-controls/lab-controls.css'];
        const publicTestFiles = ['tests/showcase-node/bookstore.test.ts'];
        if ((!/^(src\/(pages\/bookstore|lib\/bookstore|components\/docs-code)|examples)\//.test(include) && !publicLabFiles.includes(include) && !publicTestFiles.includes(include)) || include.includes('..')) {
          throw new Error(`${file}: unapproved example source ${include}`);
        }
        const sourcePath = resolve(root, include);
        if (relative(root, sourcePath).startsWith('..')) throw new Error('Example escaped repository');
        watch(sourcePath);
        node.value = readFileSync(sourcePath, 'utf8').trimEnd();
      }
      const generated = node.meta?.match(/generated="([^"]+)"/)?.[1];
      if (generated) {
        if (generated !== 'lab') throw new Error(`${file}: unknown generated example ${generated}`);
        const labFile = resolve(root, 'src/pages/lab/page.html');
        watch(labFile);
        node.value = compileHtml(readFileSync(labFile, 'utf8'), { file: labFile, kind: 'page', hasActions: true, hydrateOverride: true }).code;
      }
      const title = node.meta?.match(/title="([^"]+)"/)?.[1] ?? include ?? '';
      const html = await renderCode(node.value, node.lang ?? 'text', title);
      // Rehype gets already escaped, generated code markup, not arbitrary author HTML.
      codeBlocks.set(node, html);
    }
    const renderer = unified().use(remarkRehype, { allowDangerousHtml: true, handlers: { code: (_state, node) => ({ type: 'raw', value: codeBlocks.get(node) ?? '' }) } }).use(rehypeStringify, { allowDangerousHtml: true });
    // Remove raw author HTML; only our generated highlighted code is allowed through.
    visit(tree, 'html', node => { node.value = ''; });
    const html = String(renderer.stringify(await renderer.run(tree)));
    const markdownTree = structuredClone(tree);
    markdownTree.children = markdownTree.children.filter(node => node.type !== 'yaml');
    // Preserve the authored Markdown, expanding source fences for machine readers.
    let markdown = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    for (const node of codes.filter(node => node.meta?.includes('source=') || node.meta?.includes('generated='))) {
      const start = node.position!.start.offset!;
      const end = node.position!.end.offset!;
      const original = source.slice(start, end);
      markdown = markdown.replace(original, `\`\`\`${node.lang ?? ''}\n${node.value}\n\`\`\``);
    }
    articles.push({ id, title: meta.title, description: meta.description, section: meta.section, html, markdown: `# ${meta.title}\n\n${markdown.trim()}\n`, search: text(markdownTree), headings });
  }
  for (const article of articles) if (!documentationOrder.includes(article.id)) throw new Error(`Add ${article.id} to the explicit documentation navigation`);
  articles.sort((a, b) => documentationOrder.indexOf(a.id) - documentationOrder.indexOf(b.id));
  for (const { from, href } of links) {
    if (!href.startsWith('/docs/') && !href.startsWith('#')) continue;
    const [target, anchor] = href.startsWith('#') ? [from, href.slice(1)] : href.slice('/docs/'.length).split('#');
    const article = articles.find(article => article.id === target);
    if (!article || (anchor && !article.headings.some(heading => heading.id === anchor))) throw new Error(`${from}: broken documentation link ${href}`);
  }
  const groups: DocGroup[] = documentationSections.map(title => ({ title, articles: articles.filter(article => article.section === title).map(({ id, title, description }) => ({ id, title, description })) }));
  return { articles, groups };
}

export function documentationPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'lithono-documentation',
    configResolved(config) { root = config.root; },
    resolveId(id) { if (id === 'virtual:lithono-docs') return '\0lithono-docs'; },
    async load(id) {
      if (id !== '\0lithono-docs') return;
      const content = await buildDocumentation(root, file => this.addWatchFile(file));
      return `export const articles = ${JSON.stringify(content.articles)}; export const groups = ${JSON.stringify(content.groups)};`;
    },
    configureServer(server) {
      // New/deleted files must update the index as well as edits to existing pages.
      server.watcher.add(resolve(root, 'content/docs'));
      const invalidate = (file: string) => {
        if (!file.replaceAll('\\', '/').includes('/content/docs/')) return;
        const mod = server.environments.ssr?.moduleGraph.getModuleById('\0lithono-docs');
        if (mod) server.environments.ssr.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', invalidate).on('unlink', invalidate);
    },
  };
}
