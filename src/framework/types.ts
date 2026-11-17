import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { StandardSchemaV1 } from './standard-schema.ts';
import type { WebMcpJsonSchema, WebMcpPageConfig, WebMcpToolConfig } from './webmcp/types.ts';

export type { WebMcpJsonSchema, WebMcpPageConfig, WebMcpToolConfig };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type FieldInputType =
  | 'text'
  | 'number'
  | 'email'
  | 'url'
  | 'date'
  | 'checkbox'
  | 'password'
  | 'select'
  | 'radio';

export interface FieldConstraints {
  required?: boolean;
  type?: FieldInputType;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  step?: number | 'any';
  enum?: string[];
  description?: string;
}

export interface ActionMeta {
  method: HttpMethod;
  fields: Record<string, FieldConstraints>;
  description?: string;
  inputSchema?: WebMcpJsonSchema;
  mcp?: WebMcpToolConfig;
}

/**
 * Per-app request locals. Augment from application code:
 *
 * ```ts
 * declare module 'lithono' {
 *   interface Locals {
 *     db: Db;
 *   }
 * }
 * ```
 */
export interface Locals {}

export interface ActionFailureContext {
  action: string;
  values: Record<string, unknown>;
  issues?: readonly StandardSchemaV1.Issue[];
  error?: string;
  status: number;
}

export interface RequestContext extends Locals {
  params: Record<string, string>;
  url: URL;
  request: Request;
  c: Context;
  error?: unknown;
}

/** Loader/action argument bag. Same as `RequestContext`. */
export type Loader = RequestContext;

export interface ActionRunContext<TInput> extends RequestContext {
  input: TInput;
}

export interface ActionDefinition<
  TSchema extends StandardSchemaV1 | undefined = undefined,
  TOutput = unknown,
> {
  method: HttpMethod;
  input?: TSchema;
  description?: string;
  mcp?: WebMcpToolConfig;
  run: (
    ctx: ActionRunContext<InferActionInput<TSchema>>
  ) => Promise<TOutput> | TOutput;
}

export type InferActionInput<TSchema> = TSchema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<TSchema>
  : void;

export type InferActionClient<TActions> = {
  [K in keyof TActions]: TActions[K] extends ActionDefinition<infer TSchema, infer TOutput>
    ? InferActionInput<TSchema> extends void
      ? (input?: FormData) => Promise<TOutput>
      : (input: InferActionInput<TSchema> | FormData) => Promise<TOutput>
    : never;
};

export interface ActionDescriptor {
  name: string;
  method: HttpMethod;
  url: string;
  fields: Record<string, FieldConstraints>;
  description?: string;
  inputSchema?: WebMcpJsonSchema;
  mcp?: WebMcpToolConfig;
  /** Posted values when this action failed validation (SSR re-render). */
  values?: Record<string, unknown>;
  error?: string;
  issue?(name: string): string | undefined;
}

export type ActionView<TActions = Record<string, ActionDefinition>> = {
  [K in keyof TActions]: InferActionClient<TActions>[K] & ActionDescriptor;
};

export interface PageMeta {
  title: string;
  description?: string;
}

export interface PageModule<
  TLoaderData = unknown,
  TActions extends Record<string, ActionDefinition<StandardSchemaV1 | undefined, unknown>> = Record<
    string,
    never
  >,
> {
  loader?: (ctx: RequestContext) => Promise<TLoaderData> | TLoaderData;
  actions?: TActions;
  meta?: (ctx: { data: TLoaderData; params: Record<string, string>; url: URL }) => PageMeta;
  /** Experimental/unsupported: true is rejected at startup. Use Node SSR. */
  prerender?: boolean;
  hydrate?: boolean;
  mcp?: WebMcpPageConfig;
}

export interface LayoutModule<TLoaderData = unknown> {
  loader?: (ctx: RequestContext) => Promise<TLoaderData> | TLoaderData;
  hydrate?: boolean;
}

export interface ErrorModule {
  loader?: (ctx: RequestContext) => Promise<unknown> | unknown;
  meta?: (ctx: { data: unknown; params: Record<string, string>; url: URL; error?: unknown }) => PageMeta;
}

export type MiddlewareModule = MiddlewareHandler | MiddlewareHandler[];

export interface LithonoElementClass {
  tagName: string;
  hydrate?: boolean;
  lithonoStyles?: string[];
  lithonoChildTags?: string[];
  new (): HTMLElement;
}

export interface LithonoData {
  route: string;
  path: string;
  /** Absolute page URL, including search and hash when supplied by the browser. */
  url?: string;
  failure?: ActionFailureContext;
  params: Record<string, string>;
  data: unknown;
  layoutData: unknown[];
  /** Stable route-relative layout module identities; tags are not identities. */
  layouts?: Array<{ id: string; data: unknown }>;
  actions: Record<string, ActionMeta>;
  elements: string[];
  /** Tags with scheduled client definitions; static ancestors must not block enhancement. */
  hydrationTags?: string[];
  pageTag: string;
  layoutTags: string[];
  hydrate: boolean;
  mcp?: WebMcpPageConfig;
  user?: { id: string; email: string; name: string } | null;
  session?: unknown;
}

export interface ActionFailure {
  error: string;
  message: string;
  issues?: readonly StandardSchemaV1.Issue[];
}

export type RootKind = 'light' | 'host' | 'shadow';

/** `styles` inlines whole route stylesheets once; no critical-CSS extraction.
 * `critical` and `all` are compatibility aliases for `styles`. */
export type InlinePolicy = 'styles' | 'critical' | 'all' | 'none';

export interface LithonoPlugin {
  name: string;
  configure?(app: Hono): void | Promise<void>;
  locals?(c: Context): Partial<Locals> | Promise<Partial<Locals>>;
  ready?(): void | Promise<void>;
}

export interface SchemaOptions {
  toJSONSchema?: (schema: unknown) => unknown;
}
