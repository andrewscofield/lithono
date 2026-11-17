import { existsSync, globSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import devServer, { defaultOptions } from '@hono/vite-dev-server';
import {
  mergeConfig,
  isRunnableDevEnvironment,
  type ConfigEnv,
  type EnvironmentModuleNode,
  type Plugin,
  type UserConfig,
  type ViteDevServer,
} from 'vite';
import { loadLithonoConfig, type LithonoConfig } from './config.ts';
import { setExternalElements } from './compiler/fragments.ts';
import { isElementSourceFile, writeEditorMetadata } from './editor/manifest.ts';
import { ELEMENT_GLOBS, ELEMENT_WATCH_DIRS } from './element-id.ts';
import { compileHtmlModule, isTrioHtml } from './compiler/html.ts';
import { injectComponentTrioResult } from './compiler/inject.ts';
import { listPageHtml, listPageTs, validatePagesDir } from './compiler/files.ts';
import { clientAssetStem } from './compiler/tags.ts';
import { writeInspectOutput } from './compiler/inspect.ts';
import { addManifestAliases } from './compiler/manifest-aliases.ts';
import { applyAdapter } from './adapters/index.ts';
import { loadAppHtml } from './server/document.ts';

const PAGES_ID = 'virtual:lithono-pages';
const ELEMENTS_ID = 'virtual:lithono-elements';
const BOOTSTRAP_ID = 'virtual:lithono-bootstrap';
const RESOLVED_PAGES = `\0${PAGES_ID}`;
const RESOLVED_ELEMENTS = `\0${ELEMENTS_ID}`;
const RESOLVED_BOOTSTRAP = `\0${BOOTSTRAP_ID}`;
const EXTERNAL_ELEMENT_PREFIX = '/@lithono/elements/';

type CompilerSourceMap = {
  version: number;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
};

const BLOCKED = [
  /(?:^|[\\/])src[\\/]pages[\\/]/,
  /(?:^|[\\/])src[\\/]server[\\/]/,
  /\.server\.[cm]?[jt]sx?$/,
  /(?:^|[\\/])framework[\\/]server[\\/]/,
  /(?:^|[\\/])framework[\\/]auth[\\/](?!client(?:[./]|$))/,
  /(?:^|[\\/])framework[\\/](?:config|vite)\.[cm]?[jt]s$/,
  /(?:^|[\\/])framework[\\/]adapters[\\/]/,
  /(?:^|[\\/])framework[\\/]forms[\\/]server\.[cm]?[jt]s$/,
];

function isBlocked(id: string): boolean {
  const normalized = id.split(/[?#]/)[0]!.replaceAll('\\', '/');
  // Page templates compile to client-safe modules; their TS siblings do not.
  if (normalized.endsWith('.html.js') || normalized.startsWith('\0lithono-html:')) return false;
  if (/^lithono\/(?:server|config|vite|forms\/server)(?:\/|$)/.test(normalized) ||
      /^lithono\/auth(?:$|\/(?!client(?:\/|$)))/.test(normalized)) return true;
  if (!/\.([cm]?[jt]sx?)$/.test(normalized)) return false;
  return BLOCKED.some((pattern) => pattern.test(normalized));
}

function assertClientBoundary(id: string, importer?: string): void {
  if (!isBlocked(id)) return;
  throw new Error(
    `Lithono: server-only module imported in the client bundle:\n  ${id}\n` +
    (importer ? `  imported by ${importer}\n` : '') +
    'Pages, layouts, configuration, and server modules must stay on the server. ' +
    'Use import type for action types and lithono/client for runtime.'
  );
}

function listFiles(root: string, pattern: string): string[] {
  return globSync(pattern, { cwd: root })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => /\.(ts|js|mjs)$/.test(file) && !file.endsWith('.d.ts'))
    .sort();
}

function listElementFiles(root: string): string[] {
  const files = new Set<string>();
  for (const pattern of ELEMENT_GLOBS) {
    for (const file of listFiles(root, pattern)) files.add(file);
  }
  return [...files].sort();
}

function toImportPath(_root: string, file: string): string {
  return `/${file.replaceAll('\\', '/')}`;
}

function frameworkFile(rel: string): string {
  if (import.meta.url.endsWith('.js')) rel = rel.replace(/\.ts$/, '.js');
  return fileURLToPath(new URL(rel, import.meta.url));
}

function generatedPageLoader(root: string): string {
  validatePagesDir(root);
  const tsFiles = listPageTs(root);
  const htmlFiles = listPageHtml(root);
  const imports: string[] = [];
  tsFiles.forEach((file, index) => {
    imports.push(`import * as t${index} from ${JSON.stringify(toImportPath(root, file))};`);
  });
  htmlFiles.forEach((file, index) => {
    imports.push(`import * as h${index} from ${JSON.stringify(toImportPath(root, file))};`);
  });

  const bags = new Map<string, string[]>();
  const add = (key: string, pieces: string[]) => {
    bags.set(key, [...(bags.get(key) ?? []), ...pieces]);
  };

  tsFiles.forEach((file, index) => {
    add(`/${file}`, [`...t${index}`]);
  });
  htmlFiles.forEach((file, index) => {
    add(`/${file}`, [
      `...h${index}`,
      `element: h${index}.default`,
      `tagName: h${index}.tagName`,
      `lithonoStyles: h${index}.lithonoStyles`,
      `lithonoChildTags: h${index}.lithonoChildTags`,
      `hydrate: h${index}.hydrate`,
    ]);
    const tsRel = file.replace(/\.html$/, '.ts');
    if (tsFiles.includes(tsRel)) {
      add(`/${tsRel}`, [
        `element: h${index}.default`,
        `tagName: h${index}.tagName`,
        `lithonoStyles: h${index}.lithonoStyles`,
        `lithonoChildTags: h${index}.lithonoChildTags`,
        `hydrate: h${index}.hydrate`,
      ]);
    }
  });

  const entries = [...bags.entries()].map(
    ([key, pieces]) => `  ${JSON.stringify(key)}: { ${pieces.join(', ')} }`
  );

  return `${imports.join('\n')}
export async function loadPageModules() {
  return {
${entries.join(',\n')}
  };
}
`;
}

function generatedPageGraph(root: string, exportName: 'loadPageModules' | 'pageModules'): string {
  const body = generatedPageLoader(root);
  if (exportName === 'loadPageModules') return body;
  return body
    .replace('export async function loadPageModules() {\n  return {', 'export const pageModules = {')
    .replace(/\n  \};\n\}\n$/, '\n};\n');
}

function elementEntries(root: string, config: LithonoConfig): string[] {
  const files = [...listElementFiles(root), ...listPageHtml(root)];
  const entries = files.map((file) => {
    const spec = toImportPath(root, file);
    return `  ${JSON.stringify(`/${file}`)}: () => import(${JSON.stringify(spec)})`;
  });
  for (const [tag, entry] of Object.entries(config.elements ?? {})) {
    if (!/^[a-z][a-z0-9._-]*-[a-z0-9._-]+$/.test(tag) || !entry.import ||
        !['ssr', 'client-only'].includes(entry.mode)) {
      throw new Error(`Lithono: invalid external element mapping for ${JSON.stringify(tag)}`);
    }
    // Synthetic IDs remain stable through the existing public module/asset path API.
    const id = `${EXTERNAL_ELEMENT_PREFIX}${tag}`;
    entries.push(`  ${JSON.stringify(id)}: Object.assign(() => import(${JSON.stringify(id)}), ${JSON.stringify({ tag, clientOnly: entry.mode === 'client-only' })})`);
  }
  return entries;
}

function generatedElementLoader(root: string, config: LithonoConfig): string {
  const entries = elementEntries(root, config);
  return `export function loadElementModules() {
  return {
${entries.join(',\n')}
  };
}
`;
}

function toFsPath(id: string, root: string): string {
  const file = (id.split('?')[0] ?? id).replaceAll('\\', '/');
  if (existsSync(file)) return file;
  const fromRoot = resolve(root, file.replace(/^\//, ''));
  if (existsSync(fromRoot)) return fromRoot;
  return file;
}

function isComponentTs(file: string): boolean {
  const posix = file.replaceAll('\\', '/');
  return posix.includes('/src/components/') && posix.endsWith('.ts') && !posix.endsWith('.d.ts');
}

function clientChunkFileStem(chunk: {
  name?: string;
  facadeModuleId?: string | null;
  moduleIds?: readonly string[];
}): string {
  const fromHtml = chunk.moduleIds?.find((id) => id.includes('lithono-html:') || id.includes('/src/pages/'));
  const fromSrc = chunk.moduleIds?.find((id) => id.includes('/src/'));
  return clientAssetStem(chunk.facadeModuleId ?? fromHtml ?? fromSrc, chunk.name ?? 'chunk');
}

// Only Lit's published development tree is readable. Do not select development
// exports for unrelated dependencies (which may alter production behavior).
const READABLE_LIT = /^(?:lit|lit-html|lit-element|@lit\/reactive-element|@lit\/context|@lit-labs\/ssr-client)(?:\/|$)/;

const readableRolldownOutput = {
  minify: false as const,
  minifyInternalExports: false,
  keepNames: true,
};

function isWatchedAppSource(file: string, root: string): boolean {
  const posix = file.replaceAll('\\', '/');
  const rootPosix = root.replaceAll('\\', '/');
  const rel = posix.startsWith(rootPosix) ? posix.slice(rootPosix.length) : posix;
  return (
    /\/src\/(pages|components)\//.test(rel) ||
    /\/src\/framework\/(forms\/elements|animate\/elements)\//.test(rel)
  );
}

function lithonoHtmlIds(file: string): string[] {
  const abs = file.replaceAll('\\', '/');
  return [`${abs}.js`, `\0lithono-html:${abs}.js`, `\0lithono-html:${abs}`];
}

function compiledHtmlId(file: string): string {
  return `${file.replaceAll('\\', '/')}.js`;
}

function htmlSourceFromCompiledId(id: string): string | null {
  const posix = id.replaceAll('\\', '/');
  if (posix.startsWith('\0lithono-html:')) {
    return posix.slice('\0lithono-html:'.length).replace(/\.js$/, '');
  }
  if (posix.endsWith('.html.js')) return posix.slice(0, -3);
  return null;
}

function invalidateImporterChain(
  graph: { invalidateModule: (mod: EnvironmentModuleNode) => void },
  mod: EnvironmentModuleNode,
  seen: Set<EnvironmentModuleNode>
): void {
  if (seen.has(mod)) return;
  seen.add(mod);
  graph.invalidateModule(mod);
  for (const importer of mod.importers) invalidateImporterChain(graph, importer, seen);
}

function invalidateRunnerForFile(
  runner: { invalidateModule: (node: { id: string }) => void; evaluatedModules: {
    getModuleById: (id: string) => { id: string; importers: Set<string> } | undefined;
    getModulesByFile: (file: string) => Set<{ id: string; importers: Set<string> }> | undefined;
    idToModuleMap: Map<string, { id: string; importers: Set<string> }>;
  } },
  file: string
): void {
  const seen = new Set<string>();
  const walk = (node: { id: string; importers: Set<string> } | undefined) => {
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);
    runner.invalidateModule(node);
    for (const importerId of node.importers) {
      walk(runner.evaluatedModules.getModuleById(importerId));
    }
  };

  for (const id of lithonoHtmlIds(file)) walk(runner.evaluatedModules.getModuleById(id));
  for (const node of runner.evaluatedModules.getModulesByFile(file) ?? []) walk(node);
  if (file.endsWith('.html') || file.endsWith('.css')) {
    for (const [id, node] of runner.evaluatedModules.idToModuleMap) {
      if (id.startsWith('\0lithono-html:')) walk(node);
    }
  }
}

/**
 * Client-environment safety net plus virtual module graphs for pages
 * and Custom Elements (avoids import.meta.glob in the Vite 8 SSR runner).
 */
export function lithono(options?: LithonoConfig): Plugin {
  let root = process.cwd();
  let elementConfig: LithonoConfig = options ?? {};

  return {
    name: 'lithono',
    enforce: 'pre',
    config(config) {
      const configuredAliases = config.resolve?.alias;
      const hasSourceAlias = Array.isArray(configuredAliases)
        ? configuredAliases.some(({ find }) => typeof find === 'string' ? find === '@' : new RegExp(find).test('@/source'))
        : Object.hasOwn(configuredAliases ?? {}, '@');
      const sourceAliases = hasSourceAlias ? [] : [{ find: '@', replacement: resolve(config.root ?? process.cwd(), 'src') }];
      // Source fixtures use local sources; distributions resolve real exports.
      if (import.meta.url.endsWith('.js')) return { resolve: { alias: sourceAliases } };
      return {
        resolve: {
          alias: [
            ...sourceAliases,
            { find: 'lithono/config', replacement: frameworkFile('./config.ts') },
            { find: 'lithono/url', replacement: frameworkFile('./url.ts') },
            { find: 'lithono/webmcp', replacement: frameworkFile('./webmcp/index.ts') },
            { find: 'lithono/client/bootstrap', replacement: frameworkFile('./client/bootstrap.ts') },
            { find: 'lithono/client', replacement: frameworkFile('./client/index.ts') },
            { find: 'lithono/server', replacement: frameworkFile('./server/index.ts') },
            { find: 'lithono/vite', replacement: frameworkFile('./vite.ts') },
            { find: 'lithono/auth/client', replacement: frameworkFile('./auth/client.ts') },
            { find: 'lithono/auth', replacement: frameworkFile('./auth/server.ts') },
            { find: 'lithono/animate', replacement: frameworkFile('./animate/index.ts') },
            { find: /^lithono$/, replacement: frameworkFile('./index.ts') },
          ],
        },
      };
    },
    async configResolved(config) {
      root = config.root;
      elementConfig = options ?? await loadLithonoConfig(root, { command: config.command, mode: config.mode });
      setExternalElements(root, elementConfig.elements ?? {});
      try {
        writeEditorMetadata(root);
      } catch (error) {
        console.warn('Lithono: failed to write editor metadata', error);
      }
    },
    outputOptions(options) {
      options.minifyInternalExports = false;
      if (options.minify === 'dce-only') options.minify = false;
      if (this.environment?.name === 'ssr') options.keepNames = false;
      else if (this.environment?.name === 'client') options.keepNames = true;
      return options;
    },
    writeBundle(output, bundle) {
      if (this.environment?.name !== 'client' || !output.dir) return;
      const path = resolve(output.dir, '.vite/manifest.json');
      if (!existsSync(path)) return;
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      const sources = new Map([...listElementFiles(root), ...listPageHtml(root)]
        .map(file => [resolve(root, file).replaceAll('\\', '/'), file.replaceAll('\\', '/')]));
      addManifestAliases(manifest, Object.values(bundle).filter(item => item.type === 'chunk'), sources);
      writeFileSync(path, JSON.stringify(manifest, null, 2));
    },
    buildStart() {
      if (this.environment?.name !== 'client' || this.environment.config.command !== 'build') return;
      const legacyManifest = resolve(root, 'dist/prerender-manifest.json');
      if (!existsSync(legacyManifest)) return;
      // Remove only the exact obsolete scaffold this plugin previously wrote.
      // Unknown contents may be application/user work and must be preserved.
      try {
        const legacy = JSON.parse(readFileSync(legacyManifest, 'utf8'));
        if (Array.isArray(legacy.routes) && legacy.routes.length === 0 &&
            legacy.note === 'Filled after SSR build when a route has no loader/params/actions') {
          rmSync(legacyManifest);
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    },
    async resolveId(id, importer, options) {
      if (this.environment?.name === 'client') assertClientBoundary(id, importer);
      if (this.environment?.name === 'client' && READABLE_LIT.test(id)) {
        const resolved = await this.resolve(id, importer, { ...options, skipSelf: true });
        if (resolved && !resolved.id.includes('/development/')) {
          // Resolve package subpaths via the package root, preserving nested paths.
          const match = resolved.id.match(/^(.*\/node_modules\/(?:lit|lit-html|lit-element|@lit\/reactive-element|@lit\/context|@lit-labs\/ssr-client)\/)(.*)$/);
          const readable = match && `${match[1]}development/${match[2]}`;
          if (readable && existsSync(readable)) return readable;
        }
        return resolved;
      }
      if (id === PAGES_ID) return RESOLVED_PAGES;
      if (id === ELEMENTS_ID) return RESOLVED_ELEMENTS;
      if (id.startsWith(EXTERNAL_ELEMENT_PREFIX) && elementConfig.elements?.[id.slice(EXTERNAL_ELEMENT_PREFIX.length)]) {
        return `\0${id}`;
      }
      if (id === BOOTSTRAP_ID || id === '/@lithono/bootstrap' || id === '/@lithono/bootstrap.js') {
        return RESOLVED_BOOTSTRAP;
      }
      const file = toFsPath(id, root);
      if (this.environment?.config.command === 'build' && importer && /\.[cm]?[jt]s(?:\?|$)/.test(importer) && id.endsWith('.css')) {
        const css = await this.resolve(id, importer, { ...options, skipSelf: true });
        const owner = toFsPath(importer, root);
        const managedOwner = isComponentTs(owner) || owner.replaceAll('\\', '/').includes('/framework/animate/elements/');
        if (managedOwner && css?.id === owner.replace(/\.ts$/, '.css') && css.id.startsWith(resolve(root, 'src') + '/')) {
        // Route CSS is emitted as a separate input and attached by the document.
        // Avoid Vite's dynamic-import helper downloading it again after inlining.
          return `\0lithono-route-css:${css.id}.js`;
        }
      }
      if (!/[?&](raw|url)(?:&|$)/.test(id) && isTrioHtml(file) && existsSync(file)) {
        return compiledHtmlId(file);
      }
      if (this.environment?.name === 'client') {
        const resolved = await this.resolve(id, importer, { ...options, skipSelf: true });
        if (resolved) assertClientBoundary(resolved.id, importer);
        return resolved;
      }
    },
    transform(code, id) {
      // Vite source/asset requests are data, not executable component modules.
      // Preserve their native loaders rather than compiling exported strings.
      if (/[?&](raw|url)(?:&|$)/.test(id)) return null;
      const file = toFsPath(id, root);

      if (isComponentTs(file)) {
        const htmlFile = file.replace(/\.ts$/, '.html');
        const cssFile = file.replace(/\.ts$/, '.css');
        if (existsSync(htmlFile)) this.addWatchFile(htmlFile);
        if (existsSync(cssFile)) this.addWatchFile(cssFile);
        const injected = injectComponentTrioResult(file, code);
        if (injected) return { code: injected.code, map: injected.map as CompilerSourceMap };
      }

      if (!/\/framework\/server\/discover\.(ts|js)$/.test(file.replaceAll('\\', '/'))) {
        return null;
      }
      if (this.environment?.name === 'client') {
        throw new Error('Lithono: discover.ts is server-only.');
      }
      return { code: `${generatedPageLoader(root)}\n${generatedElementLoader(root, elementConfig)}\n`, map: { version: 3, sources: [], names: [], mappings: '' } };
    },
    load(id) {
      const environment = this.environment?.name;
      if (id.startsWith('\0lithono-route-css:')) return 'export {};';
      if (/\/framework\/server\/production\.(ts|js)$/.test(id.replaceAll('\\', '/'))) {
        if (environment === 'client') throw new Error('Lithono: production assets are server-only');
        if (this.environment?.config.command !== 'build') return null;
        const manifestFile = resolve(root, 'dist/client/.vite/manifest.json');
        const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
        const styles: Record<string, { href: string; text: string }> = {};
        for (const [key, chunk] of Object.entries(manifest) as [string, { file: string; css?: string[] }][]) {
          for (const file of [chunk.file, ...(chunk.css ?? [])].filter((file) => file.endsWith('.css'))) {
            const value = { href: `/${file}`, text: readFileSync(resolve(root, 'dist/client', file), 'utf8') };
            styles[`/${file}`] = value;
            if (key.endsWith('.css')) styles[`/${key}`] = value;
          }
        }
        return `export const productionDocument = ${JSON.stringify({ envelope: loadAppHtml(root), inline: elementConfig.inline ?? 'styles', manifest, styles })};`;
      }
      if (environment === 'client') assertClientBoundary(id);
      if (/[?&](raw|url)(?:&|$)/.test(id)) return null;
      if (id.startsWith(`\0${EXTERNAL_ELEMENT_PREFIX}`)) {
        const tag = id.slice(EXTERNAL_ELEMENT_PREFIX.length + 1);
        const entry = elementConfig.elements?.[tag];
        if (!entry) return null;
        const spec = entry.import.startsWith('.') || entry.import.startsWith('src/')
          ? `/${entry.import.replace(/^\.\//, '')}` : entry.import;
        return `import ${JSON.stringify(spec)};\n`;
      }
      if (htmlSourceFromCompiledId(id)) {
        const source = htmlSourceFromCompiledId(id);
        if (!source || !existsSync(source) || !isTrioHtml(source)) return null;
        const compiled = compileHtmlModule(source, readFileSync(source, 'utf8'));
        this.addWatchFile(source);
        // Vite treats plugin watch files as import-analysis dependencies. Server
        // siblings affect compilation but must not become client module imports.
        // configureServer watches their directories and hotUpdate reloads routes.
        for (const watch of compiled.watchFiles) {
          if (environment !== 'client' || !isBlocked(watch)) this.addWatchFile(watch);
        }
        return { code: compiled.code, map: compiled.map as CompilerSourceMap };
      }
      const file = toFsPath(id, root);

      if (isTrioHtml(file) && existsSync(file)) {
        const compiled = compileHtmlModule(file, readFileSync(file, 'utf8'));
        this.addWatchFile(file);
        for (const watch of compiled.watchFiles) {
          if (environment !== 'client' || !isBlocked(watch)) this.addWatchFile(watch);
        }
        return { code: compiled.code, map: compiled.map as CompilerSourceMap };
      }

      if (id === RESOLVED_PAGES) {
        if (environment === 'client') {
          throw new Error(
            'Lithono: virtual:lithono-pages is server-only and cannot be imported in the client bundle.'
          );
        }
        return generatedPageGraph(root, 'pageModules');
      }

      if (id === RESOLVED_BOOTSTRAP) {
        return `import ${JSON.stringify(frameworkFile('./client/bootstrap.ts'))};\n`;
      }

      if (id === RESOLVED_ELEMENTS) {
        const entries = elementEntries(root, elementConfig);
        return `export const elementModules = {\n${entries.join(',\n')}\n};\n`;
      }

    },
    configureServer(server: ViteDevServer) {
      const watchDirs = ELEMENT_WATCH_DIRS.map((dir) => resolve(root, dir));
      server.watcher.add(watchDirs);
      server.watcher.on('all', (_event, file) => {
        const posix = file.replaceAll('\\', '/');
        const watched = ELEMENT_WATCH_DIRS.some((dir) => posix.includes(`/${dir}/`) || posix.endsWith(`/${dir}`));
        if (!watched) return;
        const htmlMod = server.moduleGraph.getModuleById(`\0lithono-html:${file}.js`);
        if (htmlMod) void server.reloadModule(htmlMod);
        const pagesMod = server.moduleGraph.getModuleById(RESOLVED_PAGES);
        const elementsMod = server.moduleGraph.getModuleById(RESOLVED_ELEMENTS);
        if (pagesMod) void server.reloadModule(pagesMod);
        if (elementsMod) void server.reloadModule(elementsMod);
        if (isElementSourceFile(posix) || posix.endsWith('.html')) writeEditorMetadata(root);
      });
    },
    hotUpdate({ file, modules }) {
      if (!isWatchedAppSource(file, root)) return;
      const graph = this.environment.moduleGraph;
      const seen = new Set<EnvironmentModuleNode>();
      const extra: EnvironmentModuleNode[] = [];

      const take = (mod: EnvironmentModuleNode | undefined) => {
        if (!mod) return;
        extra.push(mod);
        invalidateImporterChain(graph, mod, seen);
      };

      for (const id of lithonoHtmlIds(file)) take(graph.getModuleById(id));
      for (const mod of graph.getModulesByFile(file) ?? []) take(mod);

      if (file.endsWith('.html') || file.endsWith('.css')) {
        for (const [id, mod] of graph.idToModuleMap) {
          if (id.startsWith('\0lithono-html:')) take(mod);
        }
      }

      if (isRunnableDevEnvironment(this.environment)) {
        invalidateRunnerForFile(
          this.environment.runner as unknown as Parameters<typeof invalidateRunnerForFile>[0],
          file
        );
      }

      if (this.environment.name === 'client') {
        this.environment.hot.send({ type: 'full-reload' });
        return [];
      }

      return extra.length ? [...modules, ...extra] : modules;
    },
    closeBundle() {
      if (this.environment?.name !== 'client') return;
      writeInspectOutput(root);
    },
  };
}

/**
 * Assembles the full Vite configuration for a Lithono project,
 * automatically loading and merging settings from lithono.config.{ts,js}.
 */
export function lithonoViteConfig(
  inlineOverrides?: UserConfig | ((env: ConfigEnv) => UserConfig | Promise<UserConfig>)
): (env: ConfigEnv) => Promise<UserConfig> {
  return async (env: ConfigEnv) => {
    const root = process.cwd();
    const lithonoConfig = await loadLithonoConfig(root, env);
    const userViteConfig =
      typeof lithonoConfig.vite === 'function'
        ? await lithonoConfig.vite(env)
        : (lithonoConfig.vite ?? {});

    const clientBootstrap = frameworkFile('./client/bootstrap.ts');
    const serverEntry = lithonoConfig.server?.serverEntry ?? 'src/server.ts';
    const devEntry = lithonoConfig.server?.entry ?? 'src/index.ts';
    const preserveServerModules = lithonoConfig.adapter?.name !== 'cloudflare';

    const baseConfig: UserConfig = {
      root,
      server: {
        fs: {
          allow: [root, resolve(frameworkFile('.'), '..')],
        },
      },
      build: {
        minify: false,
        cssMinify: false,
        sourcemap: true,
        target: 'es2022',
        rolldownOptions: {
          output: { ...readableRolldownOutput },
        },
      },
      plugins: [
        lithono(lithonoConfig),
        ...(lithonoConfig.adapter?.vitePlugins ?? []),
        devServer({
          entry: devEntry,
          injectClientScript: false,
          handleHotUpdate({ server, file }) {
            const posix = file.replaceAll('\\', '/');
            if (/\/src\/(pages|components|framework\/forms\/elements|framework\/animate\/elements)\//.test(posix)) {
              server.hot.send({ type: 'full-reload' });
            }
          },
          exclude: [
            // A Markdown URL can be an application resource (e.g. docs for agents),
            // not necessarily a Vite source module. Keep source requests excluded.
            ...defaultOptions.exclude.filter(pattern => String(pattern) !== String(/.*\.mdx?$/)),
            /^\/(src|content)\/.*\.mdx?$/,
            /.*\.(s?css|less)($|\?)/,
            /.*\.(svg|png|webp|gif|woff2?)($|\?)/,
            /^\/(public|assets|static)\/.+/,
          ],
        }),
      ],
      environments: {
        client: {
          build: {
            outDir: 'dist/client',
            emptyOutDir: true,
            manifest: true,
            minify: false,
            target: 'es2022',
            rolldownOptions: {
              input: [clientBootstrap, ...globSync('src/**/*.css', { cwd: root }).map((file) => resolve(root, file))],
              output: {
                ...readableRolldownOutput,
                chunkFileNames: (chunk) => `assets/${clientChunkFileStem(chunk)}-[hash].js`,
                entryFileNames: (chunk) => `assets/${clientChunkFileStem(chunk)}-[hash].js`,
                codeSplitting: {
                  groups: [
                    { name: 'lit', test: /[\\/]node_modules[\\/](?:lit|lit-html|lit-element|@lit)(?:-labs)?[\\/]/ },
                    { name: 'anime', test: /[\\/]node_modules[\\/]animejs[\\/]/ },
                  ],
                },
              },
            },
          },
        },
        ssr: {
          build: {
            outDir: 'dist/server',
            emptyOutDir: true,
            emitAssets: true,
            minify: false,
            target: 'es2022',
            rolldownOptions: {
              input: resolve(root, serverEntry),
              output: preserveServerModules
                ? {
                    minify: false,
                    minifyInternalExports: false,
                    preserveModules: true,
                    preserveModulesRoot: root,
                    // Query-bearing source modules need real Node filenames:
                    // a literal ?/# in an import is parsed as URL metadata.
                    sanitizeFileName: (name) => {
                      const mapped = name.replaceAll('\0', '').match(/(?:^|\/)@lithono\/elements\/([a-z0-9._-]+)$/);
                      // Rolldown validates preserved [name] before entryFileNames.
                      // Synthetic absolute IDs are not paths relative to the project.
                      if (mapped) return `_virtual/lithono-elements/${mapped[1]}`;
                      return name.replaceAll('\0', '').replace(/[?#]/g, '_');
                    },
                    entryFileNames: (chunk) => {
                      const id = chunk.facadeModuleId?.replaceAll('\\', '/') ?? '';
                      if (id.startsWith(`\0${EXTERNAL_ELEMENT_PREFIX}`)) {
                        return `_virtual/lithono-elements/${id.slice(EXTERNAL_ELEMENT_PREFIX.length + 1)}.js`;
                      }
                      if (/[?&](raw|url)(?:&|$)/.test(id)) {
                        return `${chunk.name.replace(/[?#]/g, '_')}.js`;
                      }
                      if (/\.css(?:\?|$)/.test(id)) {
                        const file = (id.split('?')[0] ?? id);
                        const srcAt = file.lastIndexOf('/src/');
                        const rel = srcAt === -1 ? `${chunk.name}.css` : file.slice(srcAt + 1);
                        return `${rel}.js`;
                      }
                      return `${chunk.name}.js`;
                    },
                    chunkFileNames: '[name].js',
                  }
                : { ...readableRolldownOutput },
            },
          },
          resolve: {
            noExternal: ['lithono'],
            ...lithonoConfig.adapter?.ssrResolve,
            ...(preserveServerModules ? { external: true as const } : {}),
          },
        },
      },
      optimizeDeps: {
        entries: [
          // Scan browser component sources, not server route modules or the
          // bootstrap's synthetic lazy template graph. Those aren't filesystem
          // entrypoints for Vite's dependency scanner.
          'src/components/**/*.{ts,js,mjs}',
          'src/framework/animate/elements/**/*.ts',
        ],
        include: [
          'lit',
          'lit/decorators.js',
          '@lit-labs/ssr-client',
          '@lit-labs/ssr-client/lit-element-hydrate-support.js',
        ],
      },
      builder: {},
    };

    let merged = mergeConfig(baseConfig, userViteConfig);
    if (lithonoConfig.adapter) {
      merged = applyAdapter(merged, lithonoConfig.adapter);
    }
    if (inlineOverrides) {
      const evaluated =
        typeof inlineOverrides === 'function'
          ? await inlineOverrides(env)
          : inlineOverrides;
      merged = mergeConfig(merged, evaluated);
    }
    for (const build of [merged.build, merged.environments?.client?.build, merged.environments?.ssr?.build]) {
      if (!build) continue;
      build.minify = false;
      build.cssMinify = false;
      build.sourcemap = true;
    }
    return merged;
  };
}
