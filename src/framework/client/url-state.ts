import type { QueryDefinition, QueryPatch, QueryShape, QueryValues, ReadOptions } from '../url.ts';
import { isRouterActive, navigate } from './router.ts';
import { getWebMcpAdapter } from '../webmcp/adapter.ts';
import { createUrlWebMcpTool, type WebMcpUrlToolOptions } from './webmcp-controller.ts';

/** The minimal browser surface; pass a fake or alternative adapter in tests. */
export interface UrlEnvironment {
  location: { readonly href: string; assign(url: string): void; replace(url: string): void };
  history: { readonly state: unknown; pushState(data: unknown, unused: string, url: string): void; replaceState(data: unknown, unused: string, url: string): void };
  addEventListener(type: 'popstate' | 'lithono:url-change', listener: EventListener): void;
  removeEventListener(type: 'popstate' | 'lithono:url-change', listener: EventListener): void;
}
export interface UrlSnapshot<S extends QueryShape> {
  readonly values: QueryValues<S>;
  readonly href: string;
  readonly generation: number;
}
export interface UrlRefresh<S extends QueryShape> extends UrlSnapshot<S> {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
}
export interface UrlStateOptions<S extends QueryShape> extends ReadOptions {
  environment?: UrlEnvironment;
  /** Return a synchronous commit function: it only runs for the current request. */
  revalidate?: (request: UrlRefresh<S>) => void | (() => void) | Promise<void | (() => void)>;
  popstateEffect?: 'local' | 'revalidate';
  onError?: (error: unknown) => void;
  mcp?: boolean | WebMcpUrlToolOptions;
}
export interface UrlUpdateOptions { history: 'push' | 'replace'; effect: 'navigate' | 'local' | 'revalidate' }

export interface UrlState<S extends QueryShape> {
  readonly current: UrlSnapshot<S>;
  subscribe(listener: (snapshot: UrlSnapshot<S>) => void): () => void;
  start(): void;
  stop(): void;
  dispose(): void;
  patch(patch: QueryPatch<S>, update: UrlUpdateOptions): Promise<void>;
  refresh(): Promise<void>;
}

export function createUrlState<S extends QueryShape>(definition: QueryDefinition<S>, options: UrlStateOptions<S> = {}): UrlState<S> {
  const environment = options.environment ?? (typeof window === 'undefined' ? undefined : window);
  const browser = typeof window !== 'undefined' && environment === window;
  if (!environment) throw new Error('createUrlState requires a browser or an environment');
  const listeners = new Set<(snapshot: UrlSnapshot<S>) => void>();
  let generation = 0;
  let active = false;
  let disposed = false;
  let pending: AbortController | undefined;
  let unregisterMcp: (() => void) | undefined;
  const read = (): UrlSnapshot<S> => Object.freeze({
    values: definition.read(new URL(environment.location.href), options), href: environment.location.href, generation,
  });
  let current = read();
  function assertUsable() { if (disposed) throw new Error('URL state is disposed'); }
  function invalidate() { pending?.abort(); pending = undefined; generation++; }
  function publish(snapshot: UrlSnapshot<S>) {
    current = snapshot;
    for (const listener of [...listeners]) listener(snapshot);
  }
  async function refresh(snapshot: UrlSnapshot<S>) {
    const callback = options.revalidate;
    if (!callback) throw new Error('Revalidate effect requires a revalidate callback');
    // A subscription may have synchronously started a newer update.
    if (snapshot.generation !== generation || disposed) return;
    const controller = new AbortController();
    pending = controller;
    const isCurrent = () => !disposed && !controller.signal.aborted && generation === snapshot.generation;
    try {
      const commit = await callback({ ...snapshot, signal: controller.signal, isCurrent });
      if (isCurrent()) commit?.();
    } catch (error) {
      if (isCurrent()) throw error;
    } finally {
      if (pending === controller) pending = undefined;
    }
  }
  const popstate: EventListener = () => {
    invalidate();
    try {
      const snapshot = read();
      publish(snapshot);
      if (!(browser && isRouterActive()) && (options.popstateEffect ?? (options.revalidate ? 'revalidate' : 'local')) === 'revalidate') {
        void refresh(snapshot).catch((error: unknown) => options.onError?.(error));
      }
    } catch (error) { options.onError?.(error); }
  };
  const stop = () => {
    if (active) environment.removeEventListener('popstate', popstate);
    if (active) environment.removeEventListener('lithono:url-change', urlChange);
    active = false;
    unregisterMcp?.();
    unregisterMcp = undefined;
    invalidate();
  };
  const urlChange: EventListener = () => {
    if (current.href === environment.location.href) return;
    invalidate();
    publish(read());
  };
  const api: UrlState<S> = {
    get current() { return current; },
    /** Subscriptions are immediate; unsubscribe is idempotent. */
    subscribe(listener: (snapshot: UrlSnapshot<S>) => void) {
      assertUsable(); listeners.add(listener); listener(current);
      return () => { listeners.delete(listener); };
    },
    start() {
      assertUsable();
      if (active) return;
      const snapshot = read();
      active = true;
      environment.addEventListener('popstate', popstate);
      environment.addEventListener('lithono:url-change', urlChange);
      if (options.mcp && !unregisterMcp) {
        const mcpOpts = typeof options.mcp === 'object' ? options.mcp : {};
        unregisterMcp = getWebMcpAdapter().register(
          createUrlWebMcpTool(api, definition, {
            hasRevalidate: Boolean(options.revalidate),
            ...mcpOpts,
          })
        );
      }
      publish(snapshot);
    },
    stop,
    dispose() {
      stop(); listeners.clear(); disposed = true;
    },
    async patch(patch: QueryPatch<S>, update: UrlUpdateOptions): Promise<void> {
      assertUsable();
      if (update.effect === 'revalidate' && !options.revalidate) throw new Error('Revalidate effect requires a revalidate callback');
      const url = new URL(environment.location.href);
      url.search = definition.write(url, patch).toString();
      // Validate the complete next snapshot before touching history.
      const values = definition.read(url, options);
      invalidate();
      if (update.effect === 'navigate') {
        if (browser && isRouterActive()) {
          await navigate(url.href, { replace: update.history === 'replace' });
          return;
        }
        environment.location[update.history === 'push' ? 'assign' : 'replace'](url.href);
        return;
      }
      environment.history[update.history === 'push' ? 'pushState' : 'replaceState'](environment.history.state, '', url.href);
      const snapshot = Object.freeze({ values, href: url.href, generation });
      publish(snapshot);
      if (browser) window.dispatchEvent(new Event('lithono:url-change'));
      if (update.effect === 'revalidate') await refresh(snapshot);
    },
    async refresh(): Promise<void> {
      assertUsable();
      if (!options.revalidate) throw new Error('Revalidate effect requires a revalidate callback');
      invalidate();
      const snapshot = read();
      publish(snapshot);
      await refresh(snapshot);
    },
  };
  return api;
}
