import type { ActionDefinition, HttpMethod, WebMcpToolConfig } from './types.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';

export const LITHONO_ACTION = '__lithono';
export const LITHONO_ACTION_MCP = Symbol.for('lithono.actionMcp');

export interface ActionHelperOptions {
  description?: string;
  mcp?: WebMcpToolConfig;
}

export type DefinedAction<
  TSchema extends StandardSchemaV1 | undefined = undefined,
  TOutput = unknown,
> = ActionDefinition<TSchema, TOutput> & {
  [LITHONO_ACTION]: 'action';
  mcp(config: WebMcpToolConfig): DefinedAction<TSchema, TOutput>;
  describe(description: string): DefinedAction<TSchema, TOutput>;
};

export function defineAction<
  TSchema extends StandardSchemaV1 | undefined = undefined,
  TOutput = unknown,
>(config: ActionDefinition<TSchema, TOutput>): DefinedAction<TSchema, TOutput> {
  const action = { ...config, [LITHONO_ACTION]: 'action' as const } as DefinedAction<
    TSchema,
    TOutput
  >;
  if (config.mcp !== undefined) {
    Object.defineProperty(action, LITHONO_ACTION_MCP, {
      value: config.mcp,
      enumerable: false,
      configurable: true,
    });
  }
  Object.defineProperties(action, {
    mcp: {
      value(mcpConfig: WebMcpToolConfig): DefinedAction<TSchema, TOutput> {
        return defineAction<TSchema, TOutput>({ ...config, mcp: mcpConfig });
      },
      enumerable: false,
      configurable: true,
    },
    describe: {
      value(description: string): DefinedAction<TSchema, TOutput> {
        return defineAction<TSchema, TOutput>({ ...config, description });
      },
      enumerable: false,
      configurable: true,
    },
  });
  return action;
}

function defineVerbAction<
  TSchema extends StandardSchemaV1 | undefined = undefined,
  TOutput = unknown,
>(method: HttpMethod, config: Omit<ActionDefinition<TSchema, TOutput>, 'method'>) {
  return defineAction<TSchema, TOutput>({ ...config, method });
}

export function definePostAction<
  TSchema extends StandardSchemaV1 | undefined = undefined,
  TOutput = unknown,
>(config: Omit<ActionDefinition<TSchema, TOutput>, 'method'>) {
  return defineVerbAction('POST', config);
}

export function defineGetAction<
  TSchema extends StandardSchemaV1 | undefined = undefined,
  TOutput = unknown,
>(config: Omit<ActionDefinition<TSchema, TOutput>, 'method'>) {
  return defineVerbAction('GET', config);
}

export function defineDeleteAction<
  TSchema extends StandardSchemaV1 | undefined = undefined,
  TOutput = unknown,
>(config: Omit<ActionDefinition<TSchema, TOutput>, 'method'>) {
  return defineVerbAction('DELETE', config);
}

export function definePatchAction<
  TSchema extends StandardSchemaV1 | undefined = undefined,
  TOutput = unknown,
>(config: Omit<ActionDefinition<TSchema, TOutput>, 'method'>) {
  return defineVerbAction('PATCH', config);
}

export function definePutAction<
  TSchema extends StandardSchemaV1 | undefined = undefined,
  TOutput = unknown,
>(config: Omit<ActionDefinition<TSchema, TOutput>, 'method'>) {
  return defineVerbAction('PUT', config);
}

type ActionFn<TInput, TOutput> = (
  ctx: import('./types.ts').ActionRunContext<TInput>
) => Promise<TOutput> | TOutput;

function isSchema(value: unknown): value is StandardSchemaV1 {
  return Boolean(value && typeof value === 'object' && '~standard' in (value as object));
}

function verbHelper(method: HttpMethod) {
  function helper<TOutput>(
    run: ActionFn<void, TOutput>,
    options?: ActionHelperOptions
  ): DefinedAction<undefined, TOutput>;
  function helper<TSchema extends StandardSchemaV1, TOutput>(
    schema: TSchema,
    run: ActionFn<StandardSchemaV1.InferOutput<TSchema>, TOutput>,
    options?: ActionHelperOptions
  ): DefinedAction<TSchema, TOutput>;
  function helper(
    schemaOrRun: StandardSchemaV1 | ActionFn<never, unknown>,
    runOrOptions?: ActionFn<never, unknown> | ActionHelperOptions,
    maybeOptions?: ActionHelperOptions
  ) {
    if (typeof schemaOrRun === 'function') {
      const opts = typeof runOrOptions === 'object' ? runOrOptions : undefined;
      return defineVerbAction(method, {
        run: schemaOrRun as never,
        ...(opts?.description !== undefined ? { description: opts.description } : {}),
        ...(opts?.mcp !== undefined ? { mcp: opts.mcp } : {}),
      });
    }
    if (!isSchema(schemaOrRun) || typeof runOrOptions !== 'function') {
      throw new Error(`Lithono: ${method.toLowerCase()}() expected a Standard Schema and a run function`);
    }
    return defineVerbAction(method, {
      input: schemaOrRun,
      run: runOrOptions as never,
      ...(maybeOptions?.description !== undefined ? { description: maybeOptions.description } : {}),
      ...(maybeOptions?.mcp !== undefined ? { mcp: maybeOptions.mcp } : {}),
    });
  }
  return helper;
}

export const post = verbHelper('POST');
export const get = verbHelper('GET');
export const put = verbHelper('PUT');
export const patch = verbHelper('PATCH');
export const destroy = verbHelper('DELETE');

export class HttpError extends Error {
  readonly status: number;
  readonly expose: boolean;

  constructor(status: number, message: string, options?: { expose?: boolean }) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.expose = options?.expose ?? status < 500;
  }
}

export function redirect(location: string, status = 303): never {
  throw new Response(null, {
    status,
    headers: { Location: location },
  });
}
