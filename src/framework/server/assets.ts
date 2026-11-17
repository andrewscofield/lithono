import { productionDocument } from './production.ts';
import { toPublicModulePath, type ElementModule } from './elements.ts';

const BOOTSTRAP_SRC = '/@lithono/bootstrap';

interface ManifestChunk {
  file: string;
  src?: string;
  name?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  css?: string[];
}

type Manifest = Record<string, ManifestChunk>;

export interface ResolvedAssets {
  bootstrap: string;
  scripts: string[];
  stylesheets: string[];
  modulePreloads: string[];
  /** CSS owned by ordinary JS/dependency imports remains linked so Vite's
   * import helper sees that link and does not download another copy. */
  linkedStylesheets?: string[];
}
function isDev(): boolean {
  return import.meta.env.DEV === true;
}

function loadManifest(): Manifest {
  if (!Object.keys(productionDocument.manifest).length) throw new Error('Lithono: missing build-time client manifest');
  return productionDocument.manifest;
}

function findChunk(manifest: Manifest, src: string): ManifestChunk | undefined {
  if (manifest[src]) return manifest[src];
  const trimmed = src.replace(/^\//, '');
  if (manifest[trimmed]) return manifest[trimmed];
  if (manifest[`/${trimmed}`]) return manifest[`/${trimmed}`];
  const bySrc = Object.values(manifest).find((chunk) => chunk.src?.replace(/^\//, '') === trimmed);
  if (bySrc) return bySrc;
  return manifest[`${trimmed}.js`];
}

function assetUrl(file: string): string {
  return file.startsWith('/') ? file : `/${file}`;
}

export function resolvePageAssets(
  moduleIds: string[],
  registry: Map<string, ElementModule>,
  extraStyles: string[] = []
): ResolvedAssets {
  if (isDev()) {
    return {
      bootstrap: BOOTSTRAP_SRC,
      scripts: [],
      stylesheets: extraStyles,
      // HTML imports resolve through Vite's virtual compiler IDs, not file URLs.
      // The bootstrap's literal import map loads them using Vite's own URLs.
      modulePreloads: moduleIds.filter(id => !id.endsWith('.html')).map((id) => {
        const entry = registry.get(id);
        return toPublicModulePath(entry?.id ?? id);
      }),
    };
  }

  const manifest = loadManifest();

  const bootstrapChunk = findChunk(manifest, BOOTSTRAP_SRC.replace(/^\//, '')) ?? Object.entries(manifest).find(([key]) => /\/client\/bootstrap\.(ts|js)$/.test(key))?.[1];
  if (!bootstrapChunk) throw new Error('Lithono: missing production bootstrap');
  const bootstrap = assetUrl(bootstrapChunk.file);

  const stylesheets = new Set(extraStyles.map((href) => {
    const style = productionDocument.styles[href];
    if (!style) throw new Error(`Lithono: stylesheet was not built: ${href}`);
    return style.href;
  }));
  const modulePreloads = new Set<string>();
  const linkedStylesheets = new Set<string>();
  const visited = new Set<string>();
  function visit(chunk: ManifestChunk) {
    if (visited.has(chunk.file)) return;
    visited.add(chunk.file);
    for (const css of chunk.css ?? []) {
      stylesheets.add(assetUrl(css));
      linkedStylesheets.add(assetUrl(css));
    }
    modulePreloads.add(assetUrl(chunk.file));
    for (const key of chunk.imports ?? []) {
      const dependency = manifest[key];
      if (!dependency) throw new Error(`Lithono: missing manifest dependency: ${key}`);
      visit(dependency);
    }
  }
  if (moduleIds.length) visit(bootstrapChunk);

  for (const id of moduleIds) {
    const entry = registry.get(id);
    const src = toPublicModulePath(entry?.id ?? id).replace(/^\//, '');
    const chunk = findChunk(manifest, src);
    if (!chunk) throw new Error(`Lithono: missing production element chunk: ${src}`);
    visit(chunk);
  }

  return {
    bootstrap,
    scripts: [],
    stylesheets: [...stylesheets],
    modulePreloads: [...modulePreloads],
    linkedStylesheets: [...linkedStylesheets],
  };
}
