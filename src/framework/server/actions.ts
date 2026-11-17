import type { Context } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import type {
  ActionDefinition,
  ActionDescriptor,
  ActionFailure,
  ActionFailureContext,
  ActionMeta,
  FieldConstraints,
  HttpMethod,
  Locals,
  RequestContext,
  WebMcpPageConfig,
  WebMcpToolConfig,
} from '../types.ts';
import type { WebMcpAnnotations, WebMcpJsonSchema } from '../webmcp/types.ts';
import { SchemaValidationError, validateSchema } from '../standard-schema.ts';
import { HttpError, LITHONO_ACTION_MCP } from '../define.ts';
import { deriveFields, deriveInputSchema, deriveSchemaDescription } from '../fields.ts';
import { ACTION_PROTOCOL_HEADER, ACTION_PROTOCOL_VERSION, actionSuccess } from '../action-protocol.ts';
import type { ActionEnvelope, ActionRefresh } from '../action-protocol.ts';

const JSON_ACCEPT = /application\/json|\+json/;
class InvalidActionJson extends Error {}

export function wantsJson(c: Context): boolean {
  const accept = c.req.header('Accept') ?? '';
  const contentType = c.req.header('Content-Type') ?? '';
  if (contentType.includes('application/json')) return true;
  if (JSON_ACCEPT.test(accept) && !accept.includes('text/html')) return true;
  return false;
}

export interface ActionRequest {
  name?: string;
  body?: unknown;
  bodyConsumed: boolean;
}

export type ActionDispatchResult =
  | { type: 'response'; response: Response }
  | { type: 'failure'; failure: ActionFailureContext };

export async function readActionRequest(c: Context): Promise<ActionRequest> {
  const fromQuery = c.req.query('_action');
  const contentType = c.req.header('Content-Type') ?? '';
  const isForm =
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data');

  if (isForm && !fromQuery) {
    const body = await readFormBody(c);
    const name = typeof body._action === 'string' ? body._action : undefined;
    return { name, body, bodyConsumed: true };
  }

  return { name: fromQuery, bodyConsumed: false };
}

async function readFormBody(c: Context): Promise<Record<string, unknown>> {
  const data = await c.req.formData();
  return collectEntries(data);
}

/** Preserve exact field names and scalar-or-array cardinality for successful controls. */
function collectEntries(entries: Iterable<[string, unknown]>): Record<string, unknown> {
  const grouped = new Map<string, unknown[]>();
  for (const [name, value] of entries) {
    const values = grouped.get(name) ?? [];
    values.push(value);
    grouped.set(name, values);
  }
  return Object.fromEntries([...grouped].map(([name, values]) => [name, values.length === 1 ? values[0] : values]));
}

function omitActionField(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== '_action'));
}

function asValues(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return { ...(input as Record<string, unknown>) };
  }
  return {};
}

async function readInput(
  c: Context,
  method: HttpMethod,
  prefetched?: ActionRequest
): Promise<unknown> {
  if (method === 'GET') {
    const url = new URL(c.req.url);
    return omitActionField(collectEntries(url.searchParams));
  }

  if (prefetched?.bodyConsumed && prefetched.body && typeof prefetched.body === 'object') {
    return omitActionField(prefetched.body as Record<string, unknown>);
  }

  const contentType = c.req.header('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    const text = await c.req.text();
    if (!text.trim()) return {};
    try { return JSON.parse(text); } catch { throw new InvalidActionJson('Invalid JSON input'); }
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    return omitActionField(await readFormBody(c));
  }

  return {};
}

export function mapParams(
  raw: Record<string, string>,
  paramNames: string[]
): Record<string, string> {
  const params = { ...raw };
  if (paramNames.includes('slug') && params['*'] && !params.slug) {
    params.slug = params['*'];
  }
  const catchAll = paramNames.find((name) => name !== '*' && !(name in params) && params['*']);
  if (catchAll && params['*']) {
    params[catchAll] = params['*'];
  }
  return params;
}

function resolveActionWebMcp(
  name: string,
  action: ActionDefinition<never, unknown>,
  fields: Record<string, FieldConstraints>,
  pageMcp?: WebMcpPageConfig
): {
  description?: string;
  inputSchema?: WebMcpJsonSchema;
  mcp?: WebMcpToolConfig;
} {
  const pageObj = typeof pageMcp === 'object' ? pageMcp : undefined;
  const pageActionOverride =
    pageObj && typeof pageObj.actions === 'object' ? pageObj.actions[name] : undefined;
  const rawActionMcp =
    LITHONO_ACTION_MCP in action
      ? (Reflect.get(action, LITHONO_ACTION_MCP) as WebMcpToolConfig | undefined)
      : typeof action.mcp === 'function'
        ? undefined
        : action.mcp;
  const actionObj = typeof rawActionMcp === 'object' ? rawActionMcp : undefined;
  const overrideObj = typeof pageActionOverride === 'object' ? pageActionOverride : undefined;

  const description =
    overrideObj?.description ??
    actionObj?.description ??
    action.description ??
    deriveSchemaDescription(action.input);
  const inputSchema = deriveInputSchema(action.input);

  const disabled =
    pageMcp === false ||
    pageObj?.enabled === false ||
    pageObj?.actions === false ||
    rawActionMcp === false ||
    actionObj?.enabled === false ||
    pageActionOverride === false ||
    overrideObj?.enabled === false;

  if (disabled) {
    return {
      ...(description ? { description } : {}),
      ...(inputSchema ? { inputSchema } : {}),
      mcp: false,
    };
  }

  const hasPassword = Object.entries(fields).some(
    ([fieldName, constraint]) => constraint.type === 'password' || /password/i.test(fieldName)
  );
  const defaultAnnotations: WebMcpAnnotations = {};
  if (action.method === 'GET') defaultAnnotations.readOnlyHint = true;
  if (action.method === 'DELETE') defaultAnnotations.destructiveHint = true;
  if (hasPassword) defaultAnnotations.consequentialHint = true;

  const mergedAnnotations: WebMcpAnnotations = {
    ...defaultAnnotations,
    ...actionObj?.annotations,
    ...overrideObj?.annotations,
  };

  const prefix = pageObj?.prefix ?? '';
  const resolvedName =
    overrideObj?.name ?? actionObj?.name ?? (prefix ? `${prefix}${name}` : undefined);
  const autosubmit = hasPassword ? false : (overrideObj?.autosubmit ?? actionObj?.autosubmit);

  const mcpConfig: Exclude<WebMcpToolConfig, boolean> = {
    ...(resolvedName ? { name: resolvedName } : {}),
    ...(description ? { description } : {}),
    ...(Object.keys(mergedAnnotations).length ? { annotations: mergedAnnotations } : {}),
    ...(autosubmit !== undefined ? { autosubmit } : {}),
  };

  return {
    ...(description ? { description } : {}),
    ...(inputSchema ? { inputSchema } : {}),
    ...(Object.keys(mcpConfig).length ? { mcp: mcpConfig } : {}),
  };
}

export function toActionMeta(
  actions: Record<string, ActionDefinition<never, unknown>> | undefined,
  pageMcp?: WebMcpPageConfig
): Record<string, ActionMeta> {
  const meta: Record<string, ActionMeta> = {};
  if (!actions) return meta;
  for (const [name, action] of Object.entries(actions)) {
    const fields = deriveFields(action.input);
    const resolved = resolveActionWebMcp(name, action, fields, pageMcp);
    meta[name] = {
      method: action.method,
      fields,
      ...resolved,
    };
  }
  return meta;
}

export function toActionDescriptors(
  path: string,
  actions: Record<string, ActionDefinition<never, unknown>> | undefined,
  pageMcp?: WebMcpPageConfig
): Record<string, ActionDescriptor> {
  const descriptors: Record<string, ActionDescriptor> = {};
  if (!actions) return descriptors;
  for (const [name, action] of Object.entries(actions)) {
    const url = new URL(path, 'http://lithono.local');
    url.searchParams.set('_action', name);
    const fields = deriveFields(action.input);
    const resolved = resolveActionWebMcp(name, action, fields, pageMcp);
    descriptors[name] = {
      name,
      method: action.method,
      url: `${url.pathname}${url.search}`,
      fields,
      ...resolved,
    };
  }
  return descriptors;
}

/** Shared display URL for native redirects, failure rendering and loader refresh. */
export function pageUrlForRevalidate(c: Context): URL {
  const url = new URL(c.req.url);
  url.searchParams.delete('_action');
  const referer = c.req.header('referer');
  if (referer) {
    try {
      const from = new URL(referer);
      if (from.origin === url.origin && from.pathname === url.pathname) {
        from.searchParams.delete('_action');
        return from;
      }
    } catch {
      // Malformed Referer: use the request URL.
    }
  }
  return url;
}

export async function dispatchAction(options: {
  c: Context;
  actionName: string;
  actions: Record<string, ActionDefinition<never, unknown>> | undefined;
  params: Record<string, string>;
  locals: Locals;
  request?: ActionRequest;
  loaders?: () => Promise<{ data?: unknown; layoutData?: unknown[]; params: Record<string, string> }>;
}): Promise<ActionDispatchResult> {
  const { c, actionName, actions, params, locals, request, loaders } = options;
  const action = actions?.[actionName];
  const json = wantsJson(c);

  if (!action) {
    return {
      type: 'response',
      response: jsonOrText(c, 404, {
        error: 'NotFound',
        message: `Unknown action "${actionName}"`,
      }),
    };
  }

  const method = c.req.method.toUpperCase() as HttpMethod;
  if (method !== action.method) {
    return {
      type: 'response',
      response: jsonOrText(
        c,
        405,
        {
          error: 'MethodNotAllowed',
          message: `Action "${actionName}" expects ${action.method}`,
        },
        { Allow: action.method }
      ),
    };
  }

  if (!isSameOriginActionRequest(c.req.raw)) {
    return {
      type: 'response',
      response: jsonOrText(c, 403, { error: 'Forbidden', message: 'Cross-origin action request rejected' }),
    };
  }

  let raw: unknown = {};
  let input: unknown = undefined;
  try {
    raw = await readInput(c, action.method, request);
    if (action.input) {
      input = await validateSchema(action.input, raw);
    } else {
      input = raw;
    }
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      if (!json) {
        return {
          type: 'failure',
          failure: {
            action: actionName,
            values: asValues(raw),
            issues: error.issues,
            error: error.message,
            status: 400,
          },
        };
      }
      return {
        type: 'response',
        response: jsonOrText(c, 400, {
          error: 'ValidationError',
          message: error.message,
          issues: error.issues,
        }),
      };
    }
    if (error instanceof InvalidActionJson) {
      return { type: 'response', response: jsonOrText(c, 400, { error: 'BadRequest', message: 'Invalid JSON input' }) };
    }
    console.error('Lithono: failed to read or validate action input', error);
    return { type: 'response', response: jsonOrText(c, 500, { error: 'ActionError', message: 'Action failed' }) };
  }

  const url = new URL(c.req.url);
  const ctx: RequestContext & { input: unknown } = {
    ...locals,
    input,
    params,
    url,
    request: c.req.raw,
    c,
  };

  try {
    const result = await action.run(ctx as never);
    if (result instanceof Response) {
      return { type: 'response', response: actionResponse(c, result) };
    }

    if (!json) {
      const page = pageUrlForRevalidate(c);
      return { type: 'response', response: c.redirect(`${page.pathname}${page.search}${page.hash}`, 303) };
    }

    const body = await jsonActionBody(c, action, result, loaders);
    return { type: 'response', response: protocolResponse(c, body) };
  } catch (error) {
    if (error instanceof Response) {
      return { type: 'response', response: actionResponse(c, error) };
    }
    if (error instanceof HttpError) {
      if (error.status >= 500) console.error('Lithono: action HTTP error', error);
      if (!json && error.status < 500) {
        return {
          type: 'failure',
          failure: {
            action: actionName,
            values: asValues(raw),
            error: error.expose ? error.message : 'Request failed',
            status: error.status,
          },
        };
      }
      return {
        type: 'response',
        response: jsonOrText(c, error.status, {
          error: error.name,
          message: error.expose ? error.message : 'Request failed',
        }),
      };
    }
    console.error('Lithono: action failed', error);
    return {
      type: 'response',
      response: jsonOrText(c, 500, { error: 'ActionError', message: 'Action failed' }),
    };
  }
}

function wantsLoaderRefresh(
  c: Context,
  method: HttpMethod
): boolean {
  if (method === 'GET') return false;
  if (c.req.header('X-Lithono-Revalidate') === '0') return false;
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

async function jsonActionBody(
  c: Context,
  action: ActionDefinition<never, unknown>,
  result: unknown,
  loaders?: () => Promise<{ data?: unknown; layoutData?: unknown[]; params: Record<string, string> }>
): Promise<ActionEnvelope> {
  if (!wantsLoaderRefresh(c, action.method) || !loaders) {
    return actionSuccess(result);
  }
  try {
    const payload = await loaders();
    // Metadata serialization is part of refresh, not part of mutation success.
    const wirePayload = JSON.parse(JSON.stringify(payload));
    return actionSuccess(result, { status: 'success', payload: wirePayload });
  } catch (error) {
    console.error('Lithono: failed to revalidate loaders after action', error);
    const refresh: ActionRefresh = { status: 'failed', message: 'Loader refresh failed' };
    return actionSuccess(result, refresh);
  }
}

/** Missing provenance is allowed for non-browser/privacy clients; explicit cross-site evidence is not.
 * Compare against the actual request URL, never untrusted forwarded host headers.
 */
export function isSameOriginActionRequest(request: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return true;
  const target = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const site = request.headers.get('Sec-Fetch-Site');
  if (site === 'cross-site') return false;
  if (origin !== null) {
    try {
      const parsed = new URL(origin);
      return parsed.origin === target && origin === parsed.origin;
    } catch { return false; }
  }
  if (referer !== null) {
    try { return new URL(referer).origin === target; } catch { return false; }
  }
  return site === null || site === 'same-origin' || site === 'none';
}

function protocolResponse(c: Context, body: ActionEnvelope, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  responseHeaders.set(ACTION_PROTOCOL_HEADER, ACTION_PROTOCOL_VERSION);
  return c.newResponse(JSON.stringify(body), { status: status as StatusCode, headers: responseHeaders });
}

function actionResponse(c: Context, response: Response): Response {
  const location = response.headers.get('Location');
  if (wantsJson(c) && [301, 302, 303, 307, 308].includes(response.status) && location) {
    const headers = new Headers(response.headers);
    headers.delete('Location');
    headers.delete('Content-Length');
    headers.delete('Content-Encoding');
    return protocolResponse(c, actionSuccess(undefined, { status: 'skipped' }, location), 200, headers);
  }
  // Native redirects must carry headers prepared by auth/actions on the Hono
  // context, just like protocolResponse does for enhanced forms.
  return c.newResponse(response.body, { status: response.status as StatusCode, headers: response.headers });
}

export function actionFailureResponse(c: Context, failure: ActionFailureContext): Response {
  return jsonOrText(c, failure.status, {
    error: failure.issues ? 'ValidationError' : 'ActionError',
    message: failure.error ?? 'Request failed',
    issues: failure.issues,
  });
}

function jsonOrText(
  c: Context,
  status: number,
  body: ActionFailure,
  headers?: Record<string, string>
): Response {
  if (wantsJson(c)) {
    return protocolResponse(c, { version: 1, ok: false, error: body }, status, headers);
  }
  return new Response(body.message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });
}
