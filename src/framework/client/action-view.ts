import type { ActionDescriptor, ActionFailureContext, ActionMeta, ActionView } from '../types.ts';
import { issueForField } from '../action-issues.ts';
import { createActionProxy } from './action-proxy.ts';

function isBrowser(): boolean {
  return typeof globalThis.window !== 'undefined' && typeof globalThis.document !== 'undefined';
}

export function descriptorsFromMeta(
  path: string,
  meta: Record<string, ActionMeta> | undefined
): Record<string, ActionDescriptor> {
  const descriptors: Record<string, ActionDescriptor> = {};
  if (!meta) return descriptors;
  for (const [name, item] of Object.entries(meta)) {
    const url = new URL(path || '/', 'http://lithono.local');
    url.searchParams.set('_action', name);
    descriptors[name] = {
      name,
      method: item.method,
      url: `${url.pathname}${url.search}`,
      fields: item.fields ?? {},
      ...(item.description !== undefined ? { description: item.description } : {}),
      ...(item.inputSchema !== undefined ? { inputSchema: item.inputSchema } : {}),
      ...(item.mcp !== undefined ? { mcp: item.mcp } : {}),
    };
  }
  return descriptors;
}

function failureBindings(name: string, failure?: ActionFailureContext) {
  const active = failure?.action === name;
  const values = active ? (failure.values ?? {}) : {};
  const error = active ? failure.error : undefined;
  const issue = (field: string) => (active ? issueForField(failure.issues, field) : undefined);
  return { values, error, issue };
}

export function bindActions(
  descriptors: Record<string, ActionDescriptor>,
  path: string,
  unwrap?: (json: unknown) => unknown,
  failure?: ActionFailureContext
): ActionView {
  const meta = Object.fromEntries(
    Object.entries(descriptors).map(([name, desc]) => [
      name,
      {
        method: desc.method,
        fields: desc.fields,
        ...(desc.description !== undefined ? { description: desc.description } : {}),
        ...(desc.inputSchema !== undefined ? { inputSchema: desc.inputSchema } : {}),
        ...(desc.mcp !== undefined ? { mcp: desc.mcp } : {}),
      },
    ])
  );
  const proxy = isBrowser() ? createActionProxy(path, meta, unwrap) : null;
  const view: Record<string, ActionDescriptor & ((input?: unknown) => Promise<unknown>)> = {};

  for (const [name, desc] of Object.entries(descriptors)) {
    const run = proxy
      ? (payload?: unknown, options?: RequestInit) =>
          (proxy as Record<string, (input?: unknown, init?: RequestInit) => Promise<unknown>>)[name]?.(
            payload,
            options
          )
      : async () => {
          throw new Error(`Lithono: action "${name}" can only run in the browser`);
        };

    const bindings = failureBindings(name, failure);

    view[name] = new Proxy(run, {
      apply(_target, _thisArg, args) {
        return run(...(args as [unknown?, RequestInit?]));
      },
      get(_target, prop, receiver) {
        if (prop === 'values' || prop === 'error' || prop === 'issue') {
          return bindings[prop];
        }
        if (Object.prototype.hasOwnProperty.call(desc, prop)) {
          return desc[prop as keyof typeof desc];
        }
        return Reflect.get(run, prop, receiver);
      },
    }) as (typeof view)[string];
  }

  return view as ActionView;
}
