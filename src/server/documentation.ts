import type { LithonoPlugin } from 'lithono';
import { articles, groups } from 'virtual:lithono-docs';

export const documentationPlugin: LithonoPlugin = {
  name: 'documentation-content',
  configure(app) {
    app.get('/llms.txt', c => c.text(`# Lithono 0.1.0-alpha.1\n\nLit-first, server-first web component application framework. Node buffered SSR.\n\nStart with /docs/installation. HTML pages and Markdown below are generated from the same source.\n\n${groups.map(group => `## ${group.title}\n\n${group.articles.map(article => `- [${article.title}](/documentation/${article.id}.md): ${article.description}`).join('\n')}`).join('\n\n')}\n`));
    app.get('/documentation/:file', c => {
      const file = c.req.param('file');
      const article = file.endsWith('.md') ? articles.find(article => article.id === file.slice(0, -3)) : undefined;
      if (!article) return c.text('Documentation not found', 404);
      c.header('Content-Type', 'text/markdown; charset=utf-8');
      return c.body(article.markdown);
    });
  },
};
