import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { StandardSchemaV1 } from '../standard-schema.ts';
import type { QueryDefinition, QueryPatch, QueryShape } from '../url.ts';
import type { UrlSnapshot, UrlUpdateOptions } from './url-state.ts';
import { defineWebMcpTool, getWebMcpAdapter } from '../webmcp/adapter.ts';
import type {
  WebMcpAdapter,
  WebMcpAnnotations,
  WebMcpExecutionContext,
  WebMcpJsonSchema,
  WebMcpToolDefinition,
} from '../webmcp/types.ts';

export const WEBMCP_TOOLS_META = Symbol.for('lithono.webmcpTools');

export interface WebMcpDecoratorOptions<TInput = Record<string, unknown>> {
  name?: string;
  description: string;
  inputSchema?: WebMcpJsonSchema;
  schema?: StandardSchemaV1<unknown, TInput>;
  annotations?: WebMcpAnnotations;
}

export interface StoredWebMcpMethodMeta<TInput = Record<string, unknown>> {
  propertyKey: string | symbol;
  options: WebMcpDecoratorOptions<TInput>;
}

export interface WebMcpMethodDecorator {
  (target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void;
  <TThis, TArgs extends unknown[], TReturn>(
    value: (this: TThis, ...args: TArgs) => TReturn,
    context: ClassMethodDecoratorContext<TThis, (this: TThis, ...args: TArgs) => TReturn>
  ): void;
}

interface Stage3MethodContext {
  kind?: string;
  name?: string | symbol;
  metadata?: Record<symbol, unknown>;
  addInitializer?: (fn: (this: unknown) => void) => void;
}

function attachWebMcpToolMeta(
  target: object,
  propertyKey: string | symbol,
  options: WebMcpDecoratorOptions
): void {
  const container = target as Record<symbol, StoredWebMcpMethodMeta[] | undefined>;
  const existing = Object.prototype.hasOwnProperty.call(container, WEBMCP_TOOLS_META)
    ? container[WEBMCP_TOOLS_META]!
    : [];
  const next = [
    ...existing.filter((entry) => entry.propertyKey !== propertyKey),
    { propertyKey, options },
  ];
  Object.defineProperty(container, WEBMCP_TOOLS_META, {
    value: next,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

/**
 * Registers a component method as a WebMCP tool while the component is connected.
 * Supports both Stage 2 (`experimentalDecorators`) and Stage 3 standard decorators.
 * Requires a `LithonoElement` base class or a `WebMcpController` attached to the element.
 */
export function webmcpTool<TInput = Record<string, unknown>>(
  options: WebMcpDecoratorOptions<TInput>
): WebMcpMethodDecorator {
  const normalizedOptions = options as WebMcpDecoratorOptions;
  return (
    targetOrValue: object,
    keyOrContext: string | symbol | Stage3MethodContext
  ): void => {
    if (
      typeof keyOrContext === 'object' &&
      keyOrContext !== null &&
      keyOrContext.kind === 'method' &&
      keyOrContext.name !== undefined
    ) {
      const methodName = keyOrContext.name;
      if (keyOrContext.metadata && typeof keyOrContext.metadata === 'object') {
        attachWebMcpToolMeta(keyOrContext.metadata, methodName, normalizedOptions);
      }
      keyOrContext.addInitializer?.(function (this: unknown) {
        if (this && typeof this === 'object') {
          const proto = Object.getPrototypeOf(this);
          if (proto && proto !== Object.prototype) {
            attachWebMcpToolMeta(proto, methodName, normalizedOptions);
          }
        }
      });
      return;
    }

    attachWebMcpToolMeta(targetOrValue, keyOrContext as string | symbol, normalizedOptions);
  };
}

export function collectDecoratedWebMcpTools(host: object): StoredWebMcpMethodMeta[] {
  const chain: StoredWebMcpMethodMeta[][] = [];
  let current: object | null = Object.getPrototypeOf(host);
  while (current && current !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(current, WEBMCP_TOOLS_META)) {
      const entries = (current as Record<symbol, StoredWebMcpMethodMeta[] | undefined>)[WEBMCP_TOOLS_META];
      if (entries?.length) chain.push(entries);
    }
    current = Object.getPrototypeOf(current);
  }
  const byKey = new Map<string | symbol, StoredWebMcpMethodMeta>();
  for (let i = chain.length - 1; i >= 0; i--) {
    for (const entry of chain[i]) {
      byKey.set(entry.propertyKey, entry);
    }
  }
  const metadataSym = (Symbol as { metadata?: symbol }).metadata;
  const ctor = (host as { constructor?: Record<symbol, unknown> }).constructor;
  if (metadataSym && ctor && typeof ctor === 'function') {
    const metaObj = ctor[metadataSym] as Record<symbol, StoredWebMcpMethodMeta[] | undefined> | undefined;
    const entries = metaObj?.[WEBMCP_TOOLS_META];
    if (entries?.length) {
      for (const entry of entries) {
        if (!byKey.has(entry.propertyKey)) {
          byKey.set(entry.propertyKey, entry);
        }
      }
    }
  }
  return [...byKey.values()];
}

export interface WebMcpControllerTool {
  name: string;
  description: string;
  inputSchema?: WebMcpJsonSchema;
  schema?: StandardSchemaV1<unknown, unknown>;
  annotations?: WebMcpAnnotations;
  source?: 'page-action' | 'component' | 'url-state' | 'custom';
  execute(input: Record<string, unknown>, context: WebMcpExecutionContext): Promise<unknown> | unknown;
}

export interface WebMcpControllerOptions {
  tools?: readonly WebMcpControllerTool[] | (() => readonly WebMcpControllerTool[]);
  scope?: string | ((host: ReactiveControllerHost) => string | undefined);
  adapter?: WebMcpAdapter;
  includeDecorators?: boolean;
}

const decoratorOwners = new WeakMap<ReactiveControllerHost, WebMcpController>();

export function hasWebMcpDecoratorOwner(host: ReactiveControllerHost): boolean {
  return decoratorOwners.has(host);
}

export class WebMcpController implements ReactiveController {
  #host: ReactiveControllerHost;
  #options: WebMcpControllerOptions;
  #dynamicTools: WebMcpControllerTool[] = [];
  #cleanups: Array<() => void> = [];
  #connected = false;

  constructor(host: ReactiveControllerHost, options: WebMcpControllerOptions = {}) {
    this.#host = host;
    this.#options = options;
    host.addController(this);
  }

  register<TInput = Record<string, unknown>, TOutput = unknown>(
    tool: WebMcpToolDefinition<TInput, TOutput>
  ): () => void {
    const wrapped: WebMcpControllerTool = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      schema: tool.schema as StandardSchemaV1<unknown, unknown> | undefined,
      annotations: tool.annotations,
      source: tool.source ?? 'component',
      execute: (input, context) => tool.execute(input as TInput, context),
    };
    this.#dynamicTools.push(wrapped);
    if (this.#connected) this.sync();
    return () => {
      const idx = this.#dynamicTools.indexOf(wrapped);
      if (idx >= 0) {
        this.#dynamicTools.splice(idx, 1);
        if (this.#connected) this.sync();
      }
    };
  }

  hostConnected(): void {
    this.#connected = true;
    if (this.#options.includeDecorators !== false && !decoratorOwners.has(this.#host)) {
      decoratorOwners.set(this.#host, this);
    }
    this.sync();
  }

  hostUpdated(): void {
    // Re-sync only when dynamic resolvers exist and host updates
  }

  hostDisconnected(): void {
    this.#connected = false;
    this.#unregisterAll();
    if (decoratorOwners.get(this.#host) === this) {
      decoratorOwners.delete(this.#host);
    }
  }

  sync(): void {
    this.#unregisterAll();
    if (!this.#connected) return;

    const adapter = this.#options.adapter ?? getWebMcpAdapter();
    const configured =
      typeof this.#options.tools === 'function'
        ? this.#options.tools()
        : (this.#options.tools ?? []);

    const decorated: WebMcpControllerTool[] =
      decoratorOwners.get(this.#host) === this
        ? collectDecoratedWebMcpTools(this.#host).map((meta) => this.#buildDecoratedTool(meta))
        : [];

    for (const tool of [...configured, ...this.#dynamicTools, ...decorated]) {
      const resolvedName = this.#resolveName(tool.name);
      const cleanup = adapter.register(
        defineWebMcpTool<unknown, unknown>({
          name: resolvedName,
          description: tool.description,
          inputSchema: tool.inputSchema,
          schema: tool.schema,
          annotations: tool.annotations,
          source: tool.source ?? 'component',
          execute: (input: unknown, context: WebMcpExecutionContext) =>
            tool.execute((input ?? {}) as Record<string, unknown>, context),
        })
      );
      this.#cleanups.push(cleanup);
    }
  }

  #buildDecoratedTool(meta: StoredWebMcpMethodMeta): WebMcpControllerTool {
    const rawLocalName = Reflect.get(this.#host, 'localName');
    const localName =
      typeof rawLocalName === 'string' && rawLocalName ? rawLocalName.replace(/-/g, '_') : '';
    const propName = String(meta.propertyKey);
    const defaultName = localName ? `${localName}_${propName}` : propName;

    return {
      name: meta.options.name ?? defaultName,
      description: meta.options.description,
      inputSchema: meta.options.inputSchema,
      schema: meta.options.schema,
      annotations: meta.options.annotations,
      source: 'component',
      execute: (input, context) => {
        const method = Reflect.get(this.#host, meta.propertyKey);
        if (typeof method !== 'function') {
          throw new Error(`WebMCP tool method "${propName}" is not callable`);
        }
        return (method as (arg: Record<string, unknown>, ctx: WebMcpExecutionContext) => unknown).call(
          this.#host,
          input,
          context
        );
      },
    };
  }

  #resolveScope(): string | undefined {
    const raw =
      typeof this.#options.scope === 'function'
        ? this.#options.scope(this.#host)
        : this.#options.scope;
    const trimmed = raw?.trim();
    return trimmed ? trimmed : undefined;
  }

  #resolveName(baseName: string): string {
    const scope = this.#resolveScope();
    return scope ? `${baseName}_${scope}` : baseName;
  }

  #unregisterAll(): void {
    while (this.#cleanups.length) {
      const cleanup = this.#cleanups.pop()!;
      try {
        cleanup();
      } catch {
        // Ignore cleanup errors during disconnect
      }
    }
  }
}

export interface WebMcpUrlToolOptions {
  name?: string;
  description?: string;
  effect?: 'revalidate' | 'local' | 'navigate';
  history?: 'push' | 'replace';
  hasRevalidate?: boolean;
}

export interface WebMcpUrlStateHandle<S extends QueryShape> {
  readonly current: UrlSnapshot<S>;
  patch(patch: QueryPatch<S>, update: UrlUpdateOptions): Promise<void>;
}

/** Creates a read-only WebMCP tool backed by a typed Lithono URL query state. */
export function createUrlWebMcpTool<S extends QueryShape>(
  urlState: WebMcpUrlStateHandle<S>,
  definition: QueryDefinition<S>,
  options: WebMcpUrlToolOptions = {}
): WebMcpToolDefinition<Record<string, unknown>, UrlSnapshot<S>> {
  const inputSchema = definition.toJsonSchema();
  const effect = options.effect ?? (options.hasRevalidate ? 'revalidate' : 'local');
  return defineWebMcpTool({
    name: options.name ?? 'update_url_query',
    description:
      options.description ??
      'Read or update URL query parameters. Pass an empty object to read current state, or null for any key to reset it to its default.',
    inputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
    source: 'url-state',
    execute: async (input) => {
      const entries = Object.entries(input ?? {});
      if (entries.length > 0) {
        const patch: Record<string, unknown> = {};
        for (const [key, value] of entries) {
          patch[key] = value === null ? undefined : value;
        }
        await urlState.patch(patch as QueryPatch<S>, {
          history: options.history ?? 'push',
          effect,
        });
      }
      return urlState.current;
    },
  });
}
