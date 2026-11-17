import type { WebMcpJsonSchema } from './webmcp/types.ts';

/** Shared, browser-safe query parsing and serialization. */
export interface QueryCodec<T> {
  readonly default: T;
  readonly description?: string;
  readonly schema?: WebMcpJsonSchema;
  decode(values: readonly string[]): T;
  encode(value: T): readonly string[];
}

export type QueryShape = Record<string, QueryCodec<unknown>>;
export type QueryValues<S extends QueryShape> = { readonly [K in keyof S]: S[K] extends QueryCodec<infer T> ? T : never };
export type QueryPatch<S extends QueryShape> = { [K in keyof S]?: QueryValues<S>[K] | undefined };
export type QueryInput = URL | URLSearchParams | string;
export interface QueryIssue { key: string; values: readonly string[]; message: string }
export class QueryValidationError extends Error {
  constructor(public readonly issues: readonly QueryIssue[]) {
    super(issues.map((issue) => `${issue.key}: ${issue.message}`).join('; '));
    this.name = 'QueryValidationError';
  }
}
export interface ReadOptions { invalid?: 'default' | 'throw' }
export interface QueryDefinition<S extends QueryShape> {
  read(input: QueryInput, options?: ReadOptions): QueryValues<S>;
  /** Undefined resets a key to its default. Unknown parameters are preserved. */
  write(input: QueryInput, patch: QueryPatch<S>): URLSearchParams;
  toJsonSchema(): WebMcpJsonSchema;
}

function params(input: QueryInput): URLSearchParams {
  if (input instanceof URL) return new URLSearchParams(input.search);
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  return new URLSearchParams(/^[a-z][a-z\d+.-]*:/i.test(input) ? new URL(input).search : input);
}

function scalar<T>(
  fallback: T,
  parse: (value: string) => T,
  format: (value: T) => string,
  meta?: { description?: string; schema?: WebMcpJsonSchema }
): QueryCodec<T> {
  // Validate defaults using exactly the same rules as URL values.
  parse(format(fallback));
  return Object.freeze({
    default: fallback,
    ...(meta?.description ? { description: meta.description } : {}),
    ...(meta?.schema ? { schema: Object.freeze(meta.schema) } : {}),
    decode(values: readonly string[]) {
      if (!values.length) return fallback;
      if (values.length !== 1) throw new Error('Expected one value');
      return parse(values[0]);
    },
    encode(value: T) { const encoded = format(value); parse(encoded); return [encoded]; },
  });
}

export const query = {
  string(options: { default?: string; validate?: (value: string) => boolean; description?: string } = {}): QueryCodec<string> {
    const fallback = options.default ?? '';
    return scalar(fallback, (value) => {
      if (options.validate && !options.validate(value)) throw new Error('Invalid string');
      return value;
    }, (value) => { if (typeof value !== 'string') throw new Error('Expected string'); return value; }, {
      description: options.description,
      schema: {
        type: 'string',
        default: fallback,
        ...(options.description ? { description: options.description } : {}),
      },
    });
  },
  enum<const T extends readonly [string, ...string[]]>(values: T, options: { default: T[number]; description?: string }): QueryCodec<T[number]> {
    const allowed = [...values];
    return scalar(options.default, (value) => {
      if (!allowed.includes(value)) throw new Error('Invalid enum value');
      return value as T[number];
    }, (value) => { if (typeof value !== 'string') throw new Error('Expected enum string'); return value; }, {
      description: options.description,
      schema: {
        type: 'string',
        enum: allowed,
        default: options.default,
        ...(options.description ? { description: options.description } : {}),
      },
    });
  },
  integer(options: { default?: number; min?: number; max?: number; description?: string } = {}): QueryCodec<number> {
    const fallback = options.default ?? 0;
    return scalar(fallback, (value) => {
      const number = Number(value);
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(number) ||
        (options.min !== undefined && number < options.min) || (options.max !== undefined && number > options.max)) {
        throw new Error('Invalid integer');
      }
      return number;
    }, (value) => { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Expected safe integer'); return String(value); }, {
      description: options.description,
      schema: {
        type: 'integer',
        default: fallback,
        ...(options.min !== undefined ? { minimum: options.min } : {}),
        ...(options.max !== undefined ? { maximum: options.max } : {}),
        ...(options.description ? { description: options.description } : {}),
      },
    });
  },
  boolean(options: { default?: boolean; description?: string } = {}): QueryCodec<boolean> {
    const fallback = options.default ?? false;
    return scalar(fallback, (value) => {
      if (value !== 'true' && value !== 'false') throw new Error('Expected true or false');
      return value === 'true';
    }, (value) => { if (typeof value !== 'boolean') throw new Error('Expected boolean'); return String(value); }, {
      description: options.description,
      schema: {
        type: 'boolean',
        default: fallback,
        ...(options.description ? { description: options.description } : {}),
      },
    });
  },
  array<T>(item: QueryCodec<T>, options: { default?: readonly T[]; description?: string } = {}): QueryCodec<readonly T[]> {
    const fallback = Object.freeze([...(options.default ?? [])]);
    const encode = (values: readonly T[]) => {
      if (!Array.isArray(values)) throw new Error('Expected array');
      return values.map((value) => {
        const encoded = item.encode(value);
        if (encoded.length !== 1) throw new Error('Array items must encode one value');
        return encoded[0];
      });
    };
    encode(fallback);
    return Object.freeze({
      default: fallback,
      ...(options.description ? { description: options.description } : {}),
      schema: Object.freeze({
        type: 'array',
        items: item.schema ?? { type: 'string' },
        default: [...fallback],
        ...(options.description ? { description: options.description } : {}),
      }),
      encode,
      decode: (values: readonly string[]) => values.length ? Object.freeze(values.map((value) => item.decode([value]))) : fallback,
    });
  },
};

export function defineQuery<const S extends QueryShape>(
  shape: S,
  queryOptions?: { description?: string }
): QueryDefinition<S> {
  const entries = Object.entries(shape);
  return Object.freeze({
    toJsonSchema(): WebMcpJsonSchema {
      const properties: Record<string, WebMcpJsonSchema> = {};
      for (const [key, codec] of entries) {
        const base: WebMcpJsonSchema = codec.schema
          ? { ...codec.schema }
          : {
              type:
                typeof codec.default === 'number'
                  ? 'number'
                  : typeof codec.default === 'boolean'
                    ? 'boolean'
                    : Array.isArray(codec.default)
                      ? 'array'
                      : 'string',
            };
        if (codec.description && !base.description) {
          base.description = codec.description;
        }
        properties[key] = base;
      }
      return {
        type: 'object',
        ...(queryOptions?.description ? { description: queryOptions.description } : {}),
        properties,
      };
    },
    read(input: QueryInput, options: ReadOptions = {}): QueryValues<S> {
      const source = params(input);
      const values: Record<string, unknown> = Object.create(null);
      const issues: QueryIssue[] = [];
      for (const [key, codec] of entries) {
        const raw = source.getAll(key);
        try { values[key] = codec.decode(raw); }
        catch (error) {
          issues.push({ key, values: raw, message: error instanceof Error ? error.message : 'Invalid value' });
          values[key] = codec.default;
        }
      }
      if (issues.length && options.invalid === 'throw') throw new QueryValidationError(issues);
      return Object.freeze(values) as QueryValues<S>;
    },
    write(input: QueryInput, patch: QueryPatch<S>): URLSearchParams {
      const result = params(input);
      for (const key of Object.keys(patch)) {
        const codec = entries.find(([name]) => name === key)?.[1];
        if (!codec) throw new QueryValidationError([{ key, values: [], message: 'Unknown query key' }]);
        try {
          const value = patch[key] === undefined ? codec.default : patch[key];
          const encoded = codec.encode(value);
          const roundTrip = codec.encode(codec.decode(encoded));
          if (encoded.length !== roundTrip.length || encoded.some((value, index) => value !== roundTrip[index])) {
            throw new Error('Value cannot be represented by this codec');
          }
          const defaults = codec.encode(codec.default);
          result.delete(key);
          if (encoded.length !== defaults.length || encoded.some((value, index) => value !== defaults[index])) {
            for (const value of encoded) result.append(key, value);
          }
        } catch (error) {
          throw new QueryValidationError([{ key, values: [], message: error instanceof Error ? error.message : 'Invalid value' }]);
        }
      }
      return result;
    },
  });
}
