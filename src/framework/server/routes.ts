import type { MiddlewareHandler } from 'hono';
import type { LayoutModule, LithonoElementClass, PageModule, WebMcpPageConfig } from '../types.ts';
import { isGroupSegment, isReservedPageBase, pagesRel, posixPath } from '../compiler/tags.ts';

export interface ResolvedElement {
  tagName: string;
  hydrate: boolean;
  lithonoStyles: string[];
  childTags: string[];
  ctor: LithonoElementClass;
  moduleId: string;
}

export interface ResolvedRoute {
  filePath: string;
  pattern: string;
  honoPath: string;
  kind: 'static' | 'dynamic' | 'catchall';
  paramNames: string[];
  resource: boolean;
  prerender: boolean;
  hydrate: boolean;
  page: PageModule<unknown, Record<string, never>>;
  pageElement?: ResolvedElement;
  layouts: Array<{
    module: LayoutModule<unknown>;
    element: ResolvedElement;
    filePath: string;
  }>;
  middlewares: MiddlewareHandler[];
  notFound?: { module: PageModule; element?: ResolvedElement; filePath: string };
  error?: { module: PageModule; element?: ResolvedElement; filePath: string };
}

export type GraphModule = Record<string, unknown> & {
  default?: unknown;
  loader?: PageModule['loader'];
  actions?: PageModule['actions'];
  meta?: PageModule['meta'];
  prerender?: boolean;
  hydrate?: boolean;
  mcp?: WebMcpPageConfig;
  tagName?: string;
  lithonoStyles?: string[];
  lithonoChildTags?: string[];
  element?: LithonoElementClass;
};

function normalizeGlobKey(key: string): string {
  const posix = posixPath(key);
  const marker = '/src/pages/';
  const index = posix.lastIndexOf(marker);
  if (index !== -1) return posix.slice(index + marker.length);
  return posix.replace(/^\.?\//, '').replace(/^src\/pages\//, '');
}

export function fileToRoute(rel: string): {
  pattern: string;
  honoPath: string;
  kind: 'static' | 'dynamic' | 'catchall';
  paramNames: string[];
} {
  let route = rel.replace(/\.(ts|html)$/, '');
  if (route.endsWith('/page')) route = route.slice(0, -'/page'.length);
  if (route === 'page') route = '';

  const paramNames: string[] = [];
  let kind: 'static' | 'dynamic' | 'catchall' = 'static';

  const segments = route
    .split('/')
    .filter((seg) => seg && !isGroupSegment(seg))
    .map((seg) => {
      if (seg.startsWith('[...') && seg.endsWith(']')) {
        kind = 'catchall';
        const name = seg.slice(4, -1);
        paramNames.push(name);
        return '*';
      }
      if (seg.startsWith('[') && seg.endsWith(']')) {
        if (kind !== 'catchall') kind = 'dynamic';
        const name = seg.slice(1, -1);
        paramNames.push(name);
        return `:${name}`;
      }
      return seg;
    });

  const honoPath = `/${segments.join('/')}` || '/';
  return { pattern: honoPath, honoPath, kind, paramNames };
}

function baseName(rel: string): string {
  const file = rel.split('/').pop() ?? rel;
  return file.replace(/\.(ts|html)$/, '');
}

function dirOf(rel: string): string {
  const parts = rel.split('/');
  parts.pop();
  return parts.join('/');
}

function ancestorDirs(pageRel: string): string[] {
  const parts = dirOf(pageRel).split('/').filter(Boolean);
  const dirs: string[] = [''];
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    dirs.push(acc);
  }
  return dirs;
}

function asElement(mod: GraphModule | undefined, filePath: string): ResolvedElement | undefined {
  if (!mod) return undefined;
  const ctor = (mod.element ?? mod.default) as LithonoElementClass | undefined;
  if (!ctor || typeof ctor !== 'function') return undefined;
  const tagName = (ctor as LithonoElementClass).tagName ?? (mod.tagName as string | undefined);
  if (!tagName) {
    throw new Error(`Lithono: compiled element for ${filePath} is missing tagName`);
  }
  return {
    tagName,
    hydrate: Boolean(ctor.hydrate ?? mod.hydrate),
    lithonoStyles: ctor.lithonoStyles ?? (mod.lithonoStyles as string[] | undefined) ?? [],
    childTags:
      (ctor as LithonoElementClass).lithonoChildTags ??
      (mod.lithonoChildTags as string[] | undefined) ??
      [],
    ctor,
    moduleId: filePath,
  };
}

function asPage(mod: GraphModule | undefined): PageModule<unknown, Record<string, never>> {
  if (!mod) return {};
  return {
    loader: mod.loader as PageModule['loader'],
    actions: mod.actions as PageModule['actions'],
    meta: mod.meta as PageModule['meta'],
    prerender: mod.prerender,
    hydrate: mod.hydrate,
    mcp: mod.mcp,
  };
}

function asLayout(mod: GraphModule | undefined): LayoutModule<unknown> {
  if (!mod) return {};
  return {
    loader: mod.loader as LayoutModule['loader'],
    hydrate: mod.hydrate as boolean | undefined,
  };
}

function asMiddleware(mod: GraphModule | undefined): MiddlewareHandler[] {
  if (!mod) return [];
  const value = (mod.default ?? mod.middleware) as unknown;
  if (!value) return [];
  return Array.isArray(value) ? value : [value as MiddlewareHandler];
}

function findInDir(
  byRel: Map<string, { filePath: string; mod: GraphModule }>,
  dir: string,
  name: string
): { filePath: string; mod: GraphModule } | undefined {
  const prefix = dir ? `${dir}/` : '';
  return byRel.get(`${prefix}${name}.html`) ?? byRel.get(`${prefix}${name}.ts`);
}

function sortRoutes(a: ResolvedRoute, b: ResolvedRoute): number {
  const kindRank = { static: 0, dynamic: 1, catchall: 2 };
  if (kindRank[a.kind] !== kindRank[b.kind]) {
    return kindRank[a.kind] - kindRank[b.kind];
  }
  const aSegs = a.pattern.split('/').filter(Boolean).length;
  const bSegs = b.pattern.split('/').filter(Boolean).length;
  if (aSegs !== bSegs) return bSegs - aSegs;
  return a.pattern.localeCompare(b.pattern);
}

export function discoverRoutes(modules: Record<string, GraphModule>): ResolvedRoute[] {
  const byRel = new Map<string, { filePath: string; mod: GraphModule }>();
  for (const [filePath, mod] of Object.entries(modules)) {
    const rel = normalizeGlobKey(filePath);
    const existing = byRel.get(rel);
    if (existing) {
      existing.mod = { ...existing.mod, ...mod };
    } else {
      byRel.set(rel, { filePath, mod });
    }
  }

  const pageRels = [...byRel.keys()].filter((rel) => {
    const base = baseName(rel);
    return base === 'page';
  });

  const seenDirs = new Set<string>();
  const routes: ResolvedRoute[] = [];

  for (const rel of pageRels) {
    const dir = dirOf(rel);
    if (seenDirs.has(dir)) continue;
    seenDirs.add(dir);

    const tsPage = byRel.get(dir ? `${dir}/page.ts` : 'page.ts');
    const htmlPage = byRel.get(dir ? `${dir}/page.html` : 'page.html');
    const pageMod = { ...(tsPage?.mod ?? {}), ...(htmlPage?.mod ?? {}) };
    const pageFile = tsPage?.filePath ?? htmlPage?.filePath ?? rel;
    const pageElement = asElement(htmlPage?.mod ?? pageMod, htmlPage?.filePath ?? pageFile);
    const resource = Boolean(tsPage) && !htmlPage;

    const layouts: ResolvedRoute['layouts'] = [];
    const middlewares: MiddlewareHandler[] = [];
    let notFound: ResolvedRoute['notFound'];
    let error: ResolvedRoute['error'];
    const dirs = ancestorDirs(dir ? `${dir}/page.ts` : 'page.ts');

    for (const ancestor of dirs) {
      const layout = findInDir(byRel, ancestor, 'layout');
      if (layout) {
        const html = byRel.get(ancestor ? `${ancestor}/layout.html` : 'layout.html');
        const ts = byRel.get(ancestor ? `${ancestor}/layout.ts` : 'layout.ts');
        const merged = { ...(ts?.mod ?? {}), ...(html?.mod ?? {}), ...layout.mod };
        const element = asElement(html?.mod ?? merged, html?.filePath ?? layout.filePath);
        if (!element) {
          throw new Error(`Lithono: layout at ${layout.filePath} needs a layout.html`);
        }
        layouts.push({
          module: asLayout(merged),
          element,
          filePath: layout.filePath,
        });
      }

      const mw = byRel.get(ancestor ? `${ancestor}/middleware.ts` : 'middleware.ts');
      if (mw) middlewares.push(...asMiddleware(mw.mod));
    }

    for (const ancestor of [...dirs].reverse()) {
      const nf = findInDir(byRel, ancestor, 'not-found');
      if (nf && !notFound) {
        const html = byRel.get(ancestor ? `${ancestor}/not-found.html` : 'not-found.html');
        const ts = byRel.get(ancestor ? `${ancestor}/not-found.ts` : 'not-found.ts');
        const merged = { ...(ts?.mod ?? {}), ...(html?.mod ?? {}), ...nf.mod };
        notFound = {
          module: asPage(merged),
          element: asElement(html?.mod ?? merged, html?.filePath ?? nf.filePath),
          filePath: nf.filePath,
        };
      }

      const err = findInDir(byRel, ancestor, 'error');
      if (err && !error) {
        const html = byRel.get(ancestor ? `${ancestor}/error.html` : 'error.html');
        const ts = byRel.get(ancestor ? `${ancestor}/error.ts` : 'error.ts');
        const merged = { ...(ts?.mod ?? {}), ...(html?.mod ?? {}), ...err.mod };
        error = {
          module: asPage(merged),
          element: asElement(html?.mod ?? merged, html?.filePath ?? err.filePath),
          filePath: err.filePath,
        };
      }
    }

    const mapped = fileToRoute(pagesRel(pageFile));
    const page = asPage(pageMod);
    if (page.prerender) throw new Error(`Lithono: prerender at ${pageFile} is experimental and unsupported; use Node SSR`);
    const hydrate =
      page.hydrate ??
      pageElement?.hydrate ??
      Boolean(page.actions);

    const route: ResolvedRoute = {
      filePath: pageFile,
      ...mapped,
      resource,
      prerender: false,
      hydrate,
      page,
      pageElement,
      layouts,
      middlewares,
      notFound,
      error,
    };
    routes.push(route);
  }

  return routes.sort(sortRoutes);
}

export { pagesRel, posixPath, isReservedPageBase };
