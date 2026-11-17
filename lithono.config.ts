import { node, defineConfig } from 'lithono/config';
import { readFileSync } from 'node:fs';
import { compileHtml } from './src/framework/compiler/html.ts';
import { documentationPlugin } from './tools/documentation.ts';

export default defineConfig({
  prefix: 'lhc',
  adapter: node(),
  inline: 'critical',
  elements: {
    'docs-code': { import: '@/components/docs-code/docs-code.client.ts', mode: 'client-only' },
    'docs-shell': { import: '@/components/docs-shell/docs-shell.client.ts', mode: 'client-only' },
    'theme-picker': { import: '@/components/theme-picker/theme-picker.client.ts', mode: 'client-only' },
    'wa-switch': { import: '@awesome.me/webawesome/dist/components/switch/switch.js', mode: 'client-only' },
  },
  vite: {
    // Keep the SDK's supplied readable build in production too. Exact matching
    // leaves CSS/subpath imports untouched; this is an application integration.
    resolve: { alias: [{ find: /^maplibre-gl$/, replacement: 'maplibre-gl/dist/maplibre-gl-dev.mjs' }] },
    plugins: [documentationPlugin(), {
      name: 'showcase-public-lab-compiler-snapshot',
      resolveId(id) { if (id === 'virtual:showcase-lab-compiler') return '\0showcase-lab-compiler'; },
      load(id) {
        if (id !== '\0showcase-lab-compiler') return;
        const file = new URL('./src/pages/lab/page.html', import.meta.url);
        this.addWatchFile(file.pathname);
        const compiled = compileHtml(readFileSync(file, 'utf8'), { file: 'src/pages/lab/page.html', kind: 'page', hasActions: true, hydrateOverride: true });
        return `export default ${JSON.stringify({ code: compiled.code, tagName: compiled.tagName, hydrate: compiled.hydrate, childTags: compiled.childTags, hydrationReasons: compiled.hydrationReasons ?? [] })};`;
      },
    }],
    // Prepare optional SDKs on the dev server so first activation does not cause
    // optimizer reloads that interrupt navigation/drafts. This does not import
    // those SDKs into a page: browser delivery stays behind the dynamic import.
    optimizeDeps: { include: ['maplibre-gl',
      '@awesome.me/webawesome/dist/components/button/button.js',
      '@awesome.me/webawesome/dist/components/switch/switch.js'] },
    server: {
      port: 5173,
    },
  },
});
