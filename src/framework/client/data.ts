import type { ActionDefinition, ActionDescriptor, ActionFailureContext, ActionMeta, ActionView, InferActionClient, LithonoData } from '../types.ts';
import { bindActions, descriptorsFromMeta } from './action-view.ts';
import { actionEnvelopeResult, parseActionEnvelope } from '../action-protocol.ts';

let cached: LithonoData | null = null;
let ssrReader: (() => Partial<LithonoData> | undefined) | undefined;

/** Install a new route snapshot before connecting its server-rendered elements. */
export function setLithonoData(data: LithonoData): void {
  beginStateRequest();
  cached = data;
  const el = document.getElementById('__LITHONO_DATA__');
  if (el) el.textContent = JSON.stringify(data);
}

function emptyData(): LithonoData {
  return {
    route: '',
    path: '/',
    url: 'http://lithono.local/',
    params: {},
    data: undefined,
    layoutData: [],
    layouts: [],
    actions: {},
    elements: [],
    pageTag: '',
    layoutTags: [],
    hydrate: false,
    user: null,
    session: null,
  };
}

function isBrowserDocument(): boolean {
  return typeof document !== 'undefined' && typeof document.getElementById === 'function';
}

export function registerSsrDataReader(reader: (() => Partial<LithonoData> | undefined) | undefined): void {
  ssrReader = reader;
}

export function getLithonoData(): LithonoData {
  if (cached) return cached;
  const ssr = ssrReader?.();
  if (ssr && Object.keys(ssr).length > 0) {
    return { ...emptyData(), ...ssr };
  }
  if (!isBrowserDocument()) {
    return emptyData();
  }
  const el = document.getElementById('__LITHONO_DATA__');
  if (!el?.textContent) {
    return emptyData();
  }
  cached = JSON.parse(el.textContent) as LithonoData;
  cached.layoutData ??= [];
  cached.layoutTags ??= [];
  cached.elements ??= [];
  cached.actions ??= {};
  cached.params ??= {};
  cached.url ??= typeof window === 'undefined' ? new URL(cached.path, 'http://lithono.local').href : window.location.href;
  return cached;
}

export function getPageData<T = unknown>(): T {
  return getLithonoData().data as T;
}

export function getParams(): Record<string, string> {
  return getLithonoData().params;
}

export function getActions<TActions = Record<string, ActionDefinition>>(): InferActionClient<TActions> {
  const data = getLithonoData();
  return bindStateActions(
    descriptorsFromMeta(data.path, data.actions),
    data.url ?? data.path,
    data.failure
  ) as InferActionClient<TActions>;
}

export function getActionFields(actionName: string) {
  return getLithonoData().actions[actionName]?.fields ?? {};
}

export function getActionMeta(actionName: string): ActionMeta | undefined {
  return getLithonoData().actions[actionName];
}

export interface RevalidatePayload {
  data?: unknown;
  layoutData?: unknown[];
  params?: Record<string, string>;
  layouts?: LithonoData['layouts'];
  url?: string;
  path?: string;
  failure?: ActionFailureContext | null;
  user?: LithonoData['user'];
  session?: unknown;
  actions?: LithonoData['actions'];
  mcp?: LithonoData['mcp'];
}

let generation = 0;
let pending: AbortController | undefined;
let activeMutations = 0;
let reconcileMutations = false;
export function isStateRequestCurrent(request: number): boolean { return request === generation; }
export function beginStateRequest(): number {
  if (activeMutations > 0) reconcileMutations = true;
  pending?.abort();
  pending = undefined;
  return ++generation;
}

/** Action calls and GET/URL refreshes share one latest-started-request clock. */
export function bindStateActions(descriptors: Record<string, ActionDescriptor>, path: string, failure?: ActionFailureContext): ActionView {
  const view = bindActions(descriptors, path, unwrapActionResult, failure);
  for (const name of Object.keys(view)) {
    const action = view[name];
    view[name] = new Proxy(action, {
      apply(_target, thisArg, args) {
        const request = beginStateRequest();
        const scoped = bindActions(descriptors, path, (json) => unwrapActionResult(json, request), failure);
        const options = args[1] as RequestInit | undefined;
        const refreshes = descriptors[name].method !== 'GET'
          && new Headers(options?.headers).get('X-Lithono-Revalidate') !== '0';
        if (!refreshes) return Reflect.apply(scoped[name], thisArg, args);
        activeMutations++;
        return (async () => {
          try { return await Reflect.apply(scoped[name], thisArg, args); }
          finally {
            activeMutations--;
            // Latest-started ordering alone cannot account for a mutation that
            // commits after a newer snapshot was loaded. Reconcile the current
            // page after overlapping mutation/refresh work has settled.
            if (activeMutations === 0 && reconcileMutations) {
              reconcileMutations = false;
              try { await revalidatePage(); }
              catch (error) {
                if (typeof document !== 'undefined') document.querySelector('[data-lithono-page]')?.dispatchEvent(
                  new CustomEvent('lithono:revalidate-error', { bubbles: true, composed: true, detail: { status: 'failed', error } })
                );
              }
            }
          }
        })();
      },
    });
  }
  return view;
}

/** Plug directly into createUrlState({ revalidate: revalidateUrlState }). */
export async function revalidateUrlState(request: { href: string; signal: AbortSignal; isCurrent(): boolean }): Promise<() => void> {
  const token = beginStateRequest();
  const response = await fetch(request.href, {
    signal: request.signal,
    headers: { Accept: 'application/json', 'X-Lithono-Revalidate': '1' },
  });
  if (!response.ok) throw new Error(`Lithono refresh failed (${response.status})`);
  const payload = await response.json() as RevalidatePayload;
  return () => { if (request.isCurrent()) applyRevalidate({ ...payload, url: request.href }, token); };
}

export async function revalidatePage(): Promise<void> {
  if (typeof window === 'undefined') return;
  const token = beginStateRequest();
  const controller = new AbortController();
  pending = controller;
  const pageUrl = new URL(window.location.href);
  pageUrl.searchParams.delete('_action');
  const href = pageUrl.href;
  try {
    const response = await fetch(href, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'X-Lithono-Revalidate': '1' },
    });
    if (!response.ok) throw new Error(`Lithono refresh failed (${response.status})`);
    applyRevalidate({ ...await response.json() as RevalidatePayload, url: href }, token);
  } catch (error) {
    if (token === generation && !controller.signal.aborted) throw error;
  } finally { if (pending === controller) pending = undefined; }
}

/** @deprecated Legacy wire key; v1 metadata is carried in the action envelope. */
export const LITHONO_REVALIDATE = '__lithono';

export function applyRevalidate(payload: RevalidatePayload, request?: number): void {
  if (request !== undefined && request !== generation) return;
  if (request === undefined) beginStateRequest();
  const boot = getLithonoData();
  if ('data' in payload) boot.data = payload.data;
  if (payload.layoutData) boot.layoutData = payload.layoutData;
  if (payload.params) boot.params = payload.params;
  if (payload.layouts) boot.layouts = payload.layouts;
  // Legacy action envelopes can still refresh already-identified layouts.
  else if (payload.layoutData && boot.layouts) boot.layouts = boot.layouts.map((layout, index) => ({ ...layout, data: payload.layoutData![index] }));
  if ('failure' in payload) boot.failure = payload.failure ?? undefined;
  else boot.failure = undefined;
  for (const key of ['url', 'path', 'user', 'session', 'actions', 'mcp'] as const) {
    if (key in payload) Object.assign(boot, { [key]: payload[key] });
  }
  if (payload.url && !payload.path) boot.path = new URL(payload.url).pathname;

  if (typeof document === 'undefined') return;
  const page = document.querySelector('[data-lithono-page]');
  page?.dispatchEvent(
    new CustomEvent('lithono:revalidate', { bubbles: true, composed: true, detail: payload })
  );
}

export function unwrapActionResult(json: unknown, request?: number): unknown {
  const envelope = parseActionEnvelope(json);
  if (envelope.ok) {
    const refresh = envelope.meta.refresh;
    if (refresh.status === 'success') applyRevalidate(refresh.payload, request);
    if (refresh.status === 'failed' && (request === undefined || request === generation) && typeof document !== 'undefined') {
      document.querySelector('[data-lithono-page]')?.dispatchEvent(
        new CustomEvent('lithono:revalidate-error', { bubbles: true, composed: true, detail: refresh })
      );
    }
  }
  return actionEnvelopeResult(envelope);
}
