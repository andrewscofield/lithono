import type { HttpMethod } from '../types.ts';
import { ACTION_PROTOCOL_HEADER, ACTION_PROTOCOL_VERSION, actionEnvelopeResult, parseActionEnvelope } from '../action-protocol.ts';
import { navigate } from './router.ts';

export class ActionRequestError extends Error {
  readonly status: number;
  readonly issues?: unknown;

  constructor(message: string, status: number, issues?: unknown) {
    super(message);
    this.name = 'ActionRequestError';
    this.status = status;
    this.issues = issues;
  }
}

/** Effective native form attributes, supplied by the form host. */
export interface ActionRequestOptions extends RequestInit {
  url?: string;
  enctype?: string;
}

function formParams(data: FormData): URLSearchParams {
  const params = new URLSearchParams();
  const normalize = (value: string) => value.replace(/\r\n|\r|\n/g, '\r\n');
  for (const [name, value] of data) params.append(normalize(name), normalize(typeof value === 'string' ? value : value.name));
  return params;
}

export function createActionProxy(
  routePath: string,
  actionMeta: Record<string, { method: string }>,
  unwrap: (json: unknown) => unknown = (json) => actionEnvelopeResult(parseActionEnvelope(json))
) {
  return new Proxy(
    {},
    {
      get(_, actionName: string) {
        if (typeof actionName !== 'string' || actionName === 'then') return undefined;
        return async (payload: unknown = {}, options: ActionRequestOptions = {}) => {
          const { url: destination, enctype, ...requestOptions } = options;
          const meta = actionMeta[actionName] ?? { method: 'POST' };
          const method = (options.method || meta.method || 'POST').toUpperCase() as HttpMethod;
          const isGet = method === 'GET';
          const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;

          const url = new URL(destination ?? routePath, window.location.href ?? window.location.origin);
          url.searchParams.set('_action', actionName);

          if (isGet && isFormData) {
            // Native GET replaces the destination query. Keep the routing discriminator.
            url.search = '';
            url.searchParams.set('_action', actionName);
            for (const [key, value] of formParams(payload as FormData)) {
              if (key !== '_action') url.searchParams.append(key, value);
            }
          }

          if (isGet && payload && typeof payload === 'object' && !isFormData) {
            for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
              if (value !== undefined && value !== null) {
                url.searchParams.set(key, String(value));
              }
            }
          }

          const headers = new Headers(options.headers);
          if (!headers.has('Accept')) headers.set('Accept', 'application/json');
          if (!isGet && !isFormData && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
          }

          let body: BodyInit | undefined;
          if (!isGet) {
            if (isFormData) {
              if (enctype === 'application/x-www-form-urlencoded') body = formParams(payload as FormData);
              else if (enctype === 'text/plain') {
                body = [...formParams(payload as FormData)].map(([key, value]) => `${key}=${value}\r\n`).join('');
                headers.set('Content-Type', 'text/plain');
              } else body = payload as FormData;
            }
            else body = JSON.stringify(payload);
          }

          const res = await fetch(url.toString(), {
            ...requestOptions,
            method,
            headers,
            body,
          });

          if (res.type === 'opaqueredirect') {
            throw new ActionRequestError('Action redirect is opaque; use the default redirect mode', res.status);
          }
          if (res.redirected || ([301, 302, 303, 307, 308].includes(res.status) && res.headers.has('Location'))) {
            const target = res.redirected ? res.url : new URL(res.headers.get('Location')!, url).href;
            await navigate(target);
            return undefined;
          }

          const protocol = res.headers.get(ACTION_PROTOCOL_HEADER);
          if (protocol !== null) {
            if (protocol !== ACTION_PROTOCOL_VERSION) throw new Error('Unsupported Lithono action protocol version');
            const envelope = parseActionEnvelope(await res.json());
            if (!envelope.ok) {
              throw new ActionRequestError(envelope.error.message, res.status, envelope.error.issues);
            }
            if (!res.ok) throw new ActionRequestError('Action request failed', res.status);
            if (envelope.meta.redirect !== undefined) {
              await navigate(new URL(envelope.meta.redirect, url).href);
              return undefined;
            }
            return unwrap(envelope);
          }

          if (!res.ok) {
            const value: unknown = await res.json().catch(() => null);
            const err = value !== null && typeof value === 'object' && !Array.isArray(value)
              ? value as { message?: unknown; issues?: unknown }
              : {};
            throw new ActionRequestError(
              typeof err.message === 'string' && err.message ? err.message : `Action ${actionName} failed`,
              res.status,
              err.issues
            );
          }

          if (res.status === 204 || res.status === 205) return undefined;
          // Raw JSON is application data, even if it resembles our protocol.
          if (/application\/json|\+json/i.test(res.headers.get('Content-Type') ?? '')) return res.json();
          return res;
        };
      },
    }
  );
}
