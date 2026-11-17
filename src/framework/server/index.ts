import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { Context } from 'hono';
import { html, unsafeStatic } from 'lit/static-html.js';
import { renderLight } from '@lit-labs/ssr-client/directives/render-light.js';
import type {
  ActionFailureContext,
  InlinePolicy,
  LithonoData,
  LithonoPlugin,
  Locals,
  PageMeta,
  RequestContext,
  SchemaOptions,
} from '../types.ts';
import { HttpError } from '../define.ts';
import { setJsonSchemaProvider } from '../fields.ts';
import { discoverRoutes, type ResolvedRoute } from './routes.ts';
import {
  actionFailureResponse,
  dispatchAction,
  mapParams,
  pageUrlForRevalidate,
  readActionRequest,
  toActionDescriptors,
  toActionMeta,
  wantsJson,
} from './actions.ts';
import { buildElementRegistry, registerServerElements, toPublicModulePath } from './elements.ts';
import { renderPageTemplate } from './render.ts';
import { resolvePageAssets } from './assets.ts';
import { streamPageResponse } from './shell.ts';
import { loadElementModules, loadPageModules } from './discover.ts';
import { productionDocument } from './production.ts';
import { jsonData, runWithSsrData } from './ssr-data.ts';

/** Select authentication data that may cross the server/browser boundary.
 * This does not configure an auth provider or replace server-side authorization.
 */
export interface LithonoAuthOptions {
  /** Defaults to null. Return only JSON-safe fields needed by the UI. */
  publicUser?: (ctx: RequestContext) => LithonoData['user'] | Promise<LithonoData['user']>;
  /** Defaults to null; authentication cookies and full server locals are unaffected. */
  publicSession?: (ctx: RequestContext) => unknown | Promise<unknown>;
}

export interface LithonoAppOptions {
  locals?: (c: Context) => Locals | Promise<Locals>;
  auth?: LithonoAuthOptions;
  head?: { lang?: string };
  plugins?: LithonoPlugin[];
  schema?: SchemaOptions;
  inline?: InlinePolicy;
}

async function collectLocals(
  c: Context,
  plugins: LithonoPlugin[],
  options: LithonoAppOptions
): Promise<Locals> {
  const merged: Locals = {} as Locals;
  for (const plugin of plugins) {
    if (plugin.locals) {
      Object.assign(merged, await plugin.locals(c));
    }
  }
  if (options.locals) {
    Object.assign(merged, await options.locals(c));
  }
  return merged;
}

function buildRequestContext(
  c: Context,
  params: Record<string, string>,
  locals: Locals,
  extra?: { error?: unknown; url?: URL }
): RequestContext {
  return {
    ...locals,
    params,
    url: extra?.url ?? new URL(c.req.url),
    request: c.req.raw,
    c,
    error: extra?.error,
  };
}

async function handleError(c: Context, error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof HttpError) {
    return new Response(error.expose ? error.message : 'Request failed', {
      status: error.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  console.error(error);
  return c.text('Internal Server Error', 500);
}

function collectStyles(route: ResolvedRoute, extra?: { tagName: string; lithonoStyles: string[] }[]): string[] {
  const styles = new Set<string>();
  for (const layout of route.layouts) {
    for (const href of layout.element.lithonoStyles) styles.add(href);
  }
  for (const href of route.pageElement?.lithonoStyles ?? []) styles.add(href);
  for (const item of extra ?? []) {
    for (const href of item.lithonoStyles) styles.add(href);
  }
  return [...styles];
}

function collectTemplateTags(route: ResolvedRoute): string[] {
  const tags = new Set<string>();
  for (const tag of route.pageElement?.childTags ?? []) tags.add(tag);
  for (const layout of route.layouts) {
    for (const tag of layout.element.childTags ?? []) tags.add(tag);
  }
  return [...tags];
}

function expandElementTags(tags: Iterable<string>): string[] {
  const seen = new Set<string>();
  const queue = [...tags];
  while (queue.length) {
    const tag = queue.pop();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    const ctor = customElements.get(tag) as { lithonoChildTags?: string[] } | undefined;
    for (const child of ctor?.lithonoChildTags ?? []) queue.push(child);
  }
  return [...seen];
}

function collectHydrateModules(route: ResolvedRoute, renderedTags: string[], registry: ReturnType<typeof buildElementRegistry>) {
  const tags = expandElementTags([...renderedTags, ...collectTemplateTags(route)]);
  const modules: string[] = [];
  if (route.hydrate && route.pageElement) {
    modules.push(toPublicModulePath(route.pageElement.moduleId));
  }
  for (const layout of route.layouts) {
    if (layout.element.hydrate || route.hydrate) {
      modules.push(toPublicModulePath(layout.element.moduleId));
    }
  }
  for (const tag of tags) {
    const entry = registry.get(tag);
    const ctor = customElements.get(tag) as { hydrate?: boolean } | undefined;
    if (entry && !entry.id.endsWith('.html') && (entry.clientOnly || ctor?.hydrate !== false)) modules.push(toPublicModulePath(entry.id));
  }
  return [...new Set(modules)];
}

function buildTree(
  route: ResolvedRoute,
  pageData: unknown,
  layoutData: unknown[],
  params: Record<string, string>,
  ctx: RequestContext,
  actions: ReturnType<typeof toActionDescriptors>,
  publicData: Pick<LithonoData, 'user' | 'session'>,
  failure?: ActionFailureContext,
  element = route.pageElement
) {
  if (!element) {
    throw new Error(`Lithono: ${route.filePath} is missing a page.html`);
  }
  const pageTag = unsafeStatic(element.tagName);
  let tree = html`<${pageTag} .data=${pageData} .params=${params} .url=${ctx.url} .descriptors=${actions} .failure=${failure} .path=${ctx.url.pathname} .session=${publicData.session}>${renderLight()}</${pageTag}>`;

  for (let i = route.layouts.length - 1; i >= 0; i--) {
    const layout = route.layouts[i];
    if (!layout) continue;
    const tag = unsafeStatic(layout.element.tagName);
    tree = html`<${tag} data-lithono-layout-id=${layoutIdentity(layout.filePath)} .data=${layoutData[i]} .params=${params} .url=${ctx.url} .path=${ctx.url.pathname} .pageChildren=${tree}>${renderLight()}</${tag}>`;
  }
  return tree;
}

function layoutIdentity(filePath: string): string {
  const path = filePath.replaceAll('\\', '/');
  return path.split('/src/pages/').at(-1)!.replace(/\.(html|ts)$/, '');
}

async function loadState(route: ResolvedRoute, ctx: RequestContext, options: LithonoAppOptions, failure?: ActionFailureContext) {
  const loaded = await Promise.all([
    ...route.layouts.map((layout) => layout.module.loader?.(ctx)),
    route.page.loader?.(ctx),
  ]);
  const layoutData = jsonData(loaded.slice(0, -1), 'layout loaders');
  return {
    data: jsonData(loaded.at(-1), 'page loader'), layoutData,
    layouts: route.layouts.map((layout, index) => ({ id: layoutIdentity(layout.filePath), data: layoutData[index] })),
    params: ctx.params, path: ctx.url.pathname, url: ctx.url.href,
    failure: failure ? jsonData(failure, 'action failure') : null,
    actions: toActionMeta(route.page.actions, route.page.mcp),
    ...(route.page.mcp !== undefined ? { mcp: route.page.mcp } : {}),
    user: jsonData((await options.auth?.publicUser?.(ctx)) ?? null, 'auth.publicUser'),
    session: jsonData((await options.auth?.publicSession?.(ctx)) ?? null, 'auth.publicSession'),
  };
}

async function renderRoute(
  c: Context,
  route: ResolvedRoute,
  params: Record<string, string>,
  locals: Locals,
  registry: ReturnType<typeof buildElementRegistry>,
  options: LithonoAppOptions,
  failure?: ActionFailureContext,
  status = 200,
  error?: unknown
) {
  const ctx = buildRequestContext(c, params, locals, { error, url: failure ? pageUrlForRevalidate(c) : undefined });
  const state = await loadState(route, ctx, options, failure);

  if (c.req.header('X-Lithono-Revalidate') === '1' || (wantsJson(c) && c.req.header('X-Lithono-Revalidate'))) {
    return c.json(state);
  }

  const pageData = state.data;
  const layoutData = state.layoutData;

  const meta: PageMeta = route.page.meta
    ? (route.page.meta as (ctx: {
        data: unknown;
        params: Record<string, string>;
        url: URL;
        error?: unknown;
      }) => PageMeta)({
        data: pageData,
        params,
        url: ctx.url,
        ...(error !== undefined ? { error } : {}),
      })
    : { title: 'Lithono' };

  const actions = toActionDescriptors(ctx.url.pathname, route.page.actions, route.page.mcp);
  const publicData = { user: state.user, session: state.session };
  const template = buildTree(route, pageData, layoutData, params, ctx, actions, publicData, state.failure ?? undefined);
  const rendered = await runWithSsrData(
    {
      ...state,
      failure: state.failure ?? undefined,
      route: route.pattern,
      pageTag: route.pageElement?.tagName ?? '',
      layoutTags: route.layouts.map((layout) => layout.element.tagName),
      hydrate: route.hydrate,
    },
    () => renderPageTemplate(template)
  );
  const elementTags = expandElementTags([...rendered.elements, ...collectTemplateTags(route)]);
  const styles = collectStyles(
    route,
    elementTags.map((tag) => {
      const ctor = customElements.get(tag) as { lithonoStyles?: string[] } | undefined;
      return { tagName: tag, lithonoStyles: ctor?.lithonoStyles ?? [] };
    })
  );
  const hydrateModules = collectHydrateModules(route, rendered.elements, registry);
  const assets = resolvePageAssets(hydrateModules, registry, styles);

  const data: LithonoData = {
    route: route.pattern,
    path: ctx.url.pathname,
    params,
    data: pageData,
    layoutData,
    actions: state.actions,
    elements: hydrateModules,
    hydrationTags: [...new Set([
      ...(route.hydrate && route.pageElement ? [route.pageElement.tagName] : []),
      ...route.layouts.filter(layout => layout.element.hydrate || route.hydrate).map(layout => layout.element.tagName),
      ...elementTags.filter(tag => {
        const entry = registry.get(tag);
        return entry && hydrateModules.includes(toPublicModulePath(entry.id));
      }),
    ])],
    pageTag: route.pageElement?.tagName ?? '',
    layoutTags: route.layouts.map((layout) => layout.element.tagName),
    hydrate: route.hydrate,
    ...(route.page.mcp !== undefined ? { mcp: route.page.mcp } : {}),
    ...publicData,
    url: state.url,
    layouts: state.layouts,
    failure: state.failure ?? undefined,
  };

  c.status(status as never);
  return streamPageResponse(c, {
    meta,
    chunks: rendered.chunks,
    assets,
    lang: options.head?.lang,
    inline: options.inline,
    data,
  });
}

async function renderSpecial(
  c: Context,
  route: ResolvedRoute,
  params: Record<string, string>,
  locals: Locals,
  registry: ReturnType<typeof buildElementRegistry>,
  options: LithonoAppOptions,
  which: 'notFound' | 'error',
  status: number,
  error?: unknown
) {
  const special = route[which];
  if (!special?.element) {
    return which === 'notFound' ? c.text('Not Found', 404) : handleError(c, error ?? new Error('Error'));
  }
  const ghost: ResolvedRoute = {
    ...route,
    page: special.module,
    pageElement: special.element,
    filePath: special.filePath,
    hydrate: special.element.hydrate,
  };
  try {
    return await renderRoute(c, ghost, params, locals, registry, options, undefined, status, error);
  } catch (next) {
    return handleError(c, next);
  }
}

export function createLithonoApp(options: LithonoAppOptions = {}) {
  const app = new Hono();
  const inner = new Hono();
  const plugins = options.plugins ?? [];
  app.use('*', logger());

  const ready = (async () => {
    setJsonSchemaProvider(options.schema?.toJSONSchema);
    if (!options.inline) {
      const config = import.meta.env?.DEV ? await (await import('../config.ts')).loadLithonoConfig() : productionDocument;
      options.inline = config.inline ?? 'styles';
    }

    for (const plugin of plugins) {
      await plugin.ready?.();
      await plugin.configure?.(inner);
    }

    const pageModules = await loadPageModules();
    const elementModules = loadElementModules();
    const routes = discoverRoutes(pageModules);
    const registry = buildElementRegistry(elementModules);
    await registerServerElements(registry);

    inner.notFound(async (c) => {
      const root = routes.find((route) => route.pattern === '/');
      if (root?.notFound) {
        const locals = await collectLocals(c, plugins, options);
        return renderSpecial(c, root, {}, locals, registry, options, 'notFound', 404);
      }
      return c.text('Not Found', 404);
    });
    inner.onError((error, c) => handleError(c, error));

    for (const route of routes) {
      for (const middleware of route.middlewares) {
        inner.all(route.honoPath, middleware);
      }
      inner.all(route.honoPath, async (c) => {
        const locals = await collectLocals(c, plugins, options);
        const params = mapParams(c.req.param(), route.paramNames);

        const actionRequest = await readActionRequest(c);

        try {
          if (route.resource && !actionRequest.name) {
            if (c.req.method === 'GET' && route.page.loader) {
              const ctx = buildRequestContext(c, params, locals);
              return c.json(await route.page.loader(ctx));
            }
            return c.text('Not Found', 404);
          }

          if (actionRequest.name) {
            const dispatched = await dispatchAction({
              c,
              actionName: actionRequest.name,
              actions: route.page.actions,
              params,
              locals,
              request: actionRequest,
              loaders: async () => {
                const ctx = buildRequestContext(c, params, locals, { url: pageUrlForRevalidate(c) });
                return loadState(route, ctx, options);
              },
            });
            if (dispatched.type === 'failure') {
              if (route.resource || !route.pageElement) {
                return actionFailureResponse(c, dispatched.failure);
              }
              return await renderRoute(
                c,
                route,
                params,
                locals,
                registry,
                options,
                dispatched.failure,
                dispatched.failure.status
              );
            }
            return dispatched.response;
          }

          if (route.resource) {
            return c.text('Not Found', 404);
          }

          return await renderRoute(c, route, params, locals, registry, options);
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof HttpError && error.status === 404) {
            return renderSpecial(c, route, params, locals, registry, options, 'notFound', 404, error);
          }
          console.error(`Lithono: ${c.req.method} ${c.req.path} failed`, error);
          if (route.error) {
            return renderSpecial(c, route, params, locals, registry, options, 'error', error instanceof HttpError ? error.status : 500, error);
          }
          return handleError(c, error);
        }
      });
    }
  })();

  app.all('*', async (c) => {
    await ready;
    return inner.fetch(c.req.raw, c.env);
  });

  return app;
}

export type { LithonoPlugin } from '../types.ts';
export { discoverRoutes, fileToRoute } from './routes.ts';
export { buildElementRegistry, tagFromModuleId } from './elements.ts';
export { streamPageResponse } from './shell.ts';
export {
  deriveFields,
  deriveInputSchema,
  deriveSchemaDescription,
  inputSchemaFromFields,
} from '../fields.ts';
