import { AsyncLocalStorage } from 'node:async_hooks';
import type { LithonoData } from '../types.ts';
import { registerSsrDataReader } from '../client/data.ts';

const store = new AsyncLocalStorage<Partial<LithonoData>>();

registerSsrDataReader(() => store.getStore());

export function runWithSsrData<T>(data: Partial<LithonoData>, fn: () => Promise<T>): Promise<T> {
  return store.run(data, fn);
}

/** JSON contract: undefined object fields are omitted; missing/array values are null.
 * Rich instances, cycles, non-finite numbers and bigint must be projected explicitly.
 * Normalize before SSR so SSR never renders a value different from boot/refresh JSON.
 */
export function jsonData<T>(value: T, label = 'state'): T {
  const ancestors = new Set<object>();
  function visit(input: unknown, path: string): unknown {
    if (input === undefined || input === null) return null;
    if (typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input !== 'object') throw new Error(`Lithono: ${path} must be JSON data`);
    if (ancestors.has(input)) throw new Error(`Lithono: ${path} contains a cycle`);
    if (!Array.isArray(input) && Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
      throw new Error(`Lithono: ${path} must be a plain JSON object`);
    }
    ancestors.add(input);
    const result = Array.isArray(input)
      ? Array.from(input, (item, index) => visit(item, `${path}[${index}]`))
      : Object.fromEntries(Object.entries(input).filter(([, item]) => item !== undefined).map(([key, item]) => [key, visit(item, `${path}.${key}`)]));
    ancestors.delete(input);
    return result;
  }
  return visit(value, label) as T;
}
