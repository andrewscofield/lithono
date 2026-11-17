import { existsSync, globSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { compileHtmlModule } from './html.ts';
import { listPageHtml } from './files.ts';
import { injectComponentTrioResult } from './inject.ts';
import { analyzeModule } from './parser.ts';
import { tagFromModuleId } from '../element-id.ts';

interface ManifestChunk {
  file: string;
  src?: string;
}

function copyManifestChunks(root: string): void {
  const manifestPath = join(root, 'dist/client/.vite/manifest.json');
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, ManifestChunk>;
  for (const [key, info] of Object.entries(manifest)) {
    const src = info.src ?? key;
    const file = info.file;
    if (!file?.endsWith('.js')) continue;
    const from = join(root, 'dist/client', file);
    if (!existsSync(from)) continue;
    let rel: string;
    if (src.includes('/src/')) {
      rel = `src/${
        src
          .split('/src/')[1]
          ?.replace(/\.html\.js$/, '.js')
          .replace(/\.ts$/, '.js') ?? file
      }`;
    } else if (src.startsWith('src/')) {
      rel = src.replace(/\.ts$/, '.js').replace(/\.html$/, '.js');
    } else if (src.startsWith('lithono-html:')) {
      rel = src.replace(/^lithono-html:/, '').replace(/\.html\.js$/, '.js');
      const idx = rel.lastIndexOf('/src/');
      rel = idx === -1 ? `pages/${rel}` : rel.slice(idx + 1);
    } else {
      continue;
    }
    const dest = join(root, 'dist/inspect/bundled', rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(from));
  }
}

export function writeInspectOutput(root: string): void {
  const inspectRoot = join(root, 'dist/inspect');
  rmSync(inspectRoot, { recursive: true, force: true });
  mkdirSync(join(inspectRoot, 'compiled'), { recursive: true });
  const entries: object[] = [];

  for (const rel of [
    ...listPageHtml(root),
    ...globSync('src/components/**/*.html', { cwd: root }).sort(),
  ]) {
    const abs = join(root, rel);
    const compiled = compileHtmlModule(abs, readFileSync(abs, 'utf8'));
    const dest = join(inspectRoot, 'compiled', rel.replace(/\.html$/, '.js'));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, compiled.code);
    if (compiled.map) writeFileSync(`${dest}.map`, JSON.stringify(compiled.map));
    entries.push({
      file: rel,
      tagName: compiled.tagName,
      hydrate: compiled.hydrate,
      hydrationReasons: compiled.hydrationReasons,
      registration: compiled.registration,
      loaderKeys: compiled.loaderKeys,
      childTags: compiled.childTags,
      dependencies: compiled.dependencies,
    });
  }

  const components: object[] = [];
  for (const rel of globSync('src/components/**/*.ts', { cwd: root })
    .filter((file) => !file.endsWith('.d.ts'))
    .sort()) {
    const abs = join(root, rel);
    const source = readFileSync(abs, 'utf8');
    const analysis = analyzeModule(source, abs);
    const injected = injectComponentTrioResult(abs, source);
    const dest = join(inspectRoot, 'compiled', rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, injected?.code ?? source);
    if (injected) writeFileSync(`${dest}.map`, JSON.stringify(injected.map));
    components.push({
      file: rel,
      tagName: tagFromModuleId(abs),
      registration: analysis.hasCustomElement
        ? 'customElement decorator'
        : analysis.classNode
          ? 'defineFromFilename'
          : 'none',
      className:
        analysis.className ?? (analysis.classNode ? 'generated anonymous class name' : null),
      hydrationReasons: ['registered component; route hydration controls activation'],
      dependencies: {
        imports: analyzeModule(injected?.code ?? source, abs).imports,
        files: [
          abs,
          ...['html', 'css'].map((ext) => abs.replace(/\.ts$/, `.${ext}`)).filter(existsSync),
        ],
      },
    });
  }
  writeFileSync(
    join(inspectRoot, 'manifest.json'),
    `${JSON.stringify({ version: 1, templates: entries, components }, null, 2)}\n`
  );
  copyManifestChunks(root);
}
