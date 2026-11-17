import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDocumentation, documentationOrder, documentationPlugin } from '../tools/documentation.ts';
import { createServer } from 'vite';
import { renderCode } from '../src/server/code-highlight.ts';
import { compileHtml, compileComponentRender } from '../src/framework/compiler/html.ts';

test('published documentation covers the explicit navigation and renders real source with dual theme tokens', async () => {
  const { articles, groups } = await buildDocumentation(process.cwd());
  assert.deepEqual(articles.map(article => article.id), documentationOrder);
  assert.equal(groups.length, 6);
  for (const article of articles) {
    assert.ok(article.headings.length >= 3, `${article.id} needs useful section navigation`);
    assert.ok(article.markdown.length > 1500, `${article.id} should explain its topic`);
    assert.doesNotMatch(article.html, /<script\b/);
    assert.equal(new Set(article.headings.map(heading => heading.id)).size, article.headings.length);
  }
  const receiving = articles.find(article => article.id === 'receiving-stock')!;
  assert.match(receiving.html, /<docs-code>/);
  assert.match(receiving.html, /--shiki-light/);
  assert.match(receiving.html, /--shiki-dark/);
  assert.match(receiving.markdown, /catalog\.receive\(/);
  assert.doesNotMatch(receiving.markdown, /source="/);
});

test('code is escaped and labels cannot inject markup', async () => {
  const html = await renderCode('<script>alert("example")</script>\n  <p>spaces</p>', 'html', '"><img src=x>');
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&#x3C;/);
  assert.match(html, /&lt;img/);
  assert.match(html, /data-copy disabled/);
});

test('content rejects broken links, strips author HTML, and gives repeated headings unique anchors', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lithono-doc-content-'));
  mkdirSync(join(root, 'content/docs'), { recursive: true });
  const path = join(root, 'content/docs/introduction.md');
  const frontmatter = '---\ntitle: Test\ndescription: Example\nsection: Get started\n---\n';
  try {
    writeFileSync(path, `${frontmatter}\n## Same\n\n## Same\n\n<script>bad()</script>\n\n[second](#same-2)`);
    const { articles } = await buildDocumentation(root);
    assert.deepEqual(articles[0].headings.map(heading => heading.id), ['same', 'same-2']);
    assert.doesNotMatch(articles[0].html, /<script>|bad\(\)/);
    writeFileSync(path, `${frontmatter}\n## Links\n\n[missing](/docs/not-an-article)`);
    await assert.rejects(buildDocumentation(root), /broken documentation link/);
    writeFileSync(path, `${frontmatter}\n## Source\n\n\`\`\`ts source="src/server/auth.ts"\n\`\`\``);
    await assert.rejects(buildDocumentation(root), /unapproved example source/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('trusted HTML template helper imports explicitly without becoming loader data', () => {
  const result = compileHtml('<article>${unsafeHTML(article.html)}</article>', { file: '/app/src/pages/docs/page.html', kind: 'page', hydrateOverride: false });
  assert.match(result.code, /import \{[^}]*unsafeHTML/);
  assert.deepEqual(result.loaderKeys, ['article']);
  assert.equal(result.hydrate, false);
  const component = compileComponentRender('/app/src/components/article-body/article-body.html', '<div>${unsafeHTML(content)}</div>');
  assert.ok(component.imports.some(line => line.includes("from 'lit/directives/unsafe-html.js'")));
});

test('development content refreshes after an article edit without restarting the server', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lithono-doc-watch-'));
  mkdirSync(join(root, 'content/docs'), { recursive: true });
  const path = join(root, 'content/docs/introduction.md');
  const source = '---\ntitle: Watch test\ndescription: Example\nsection: Get started\n---\n\n## Section\n\nOriginal explanation.';
  writeFileSync(path, source);
  const server = await createServer({ root, configFile: false, plugins: [documentationPlugin()], server: { middlewareMode: true } });
  try {
    const initial = await server.ssrLoadModule('virtual:lithono-docs');
    assert.match(initial.articles[0].html, /Original explanation/);
    await new Promise(resolve => setTimeout(resolve, 100));
    writeFileSync(path, source.replace('Original explanation', 'Updated explanation'));
    let updated = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      const next = await server.ssrLoadModule('virtual:lithono-docs');
      if (next.articles[0].html.includes('Updated explanation')) { updated = true; break; }
    }
    assert.equal(updated, true, 'editing Markdown must invalidate the virtual SSR content module');
    const added = join(root, 'content/docs/installation.md');
    writeFileSync(added, source.replace('Watch test', 'A new article'));
    let count = 1;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      count = (await server.ssrLoadModule('virtual:lithono-docs')).articles.length;
      if (count === 2) break;
    }
    assert.equal(count, 2, 'new articles must appear without restarting');
    rmSync(added);
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      count = (await server.ssrLoadModule('virtual:lithono-docs')).articles.length;
      if (count === 1) break;
    }
    assert.equal(count, 1, 'removed articles must leave the navigation without restarting');
  } finally { await server.close(); rmSync(root, { recursive: true, force: true }); }
});
