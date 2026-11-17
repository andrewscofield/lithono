import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfigFromFile, type ConfigEnv, type UserConfig } from 'vite';
import type { LithonoAdapter } from './adapters/index.ts';
import type { InlinePolicy } from './types.ts';
import type { WebMcpGlobalConfig } from './webmcp/types.ts';

export type { LithonoAdapter } from './adapters/index.ts';
export { node, cloudflare } from './adapters/index.ts';

export interface LithonoServerConfig {
  /** Dev server entry (defaults to 'src/index.ts') */
  entry?: string;
  /** Production SSR server runner entry (defaults to 'src/server.ts'). Emitted as `dist/server/src/server.js`. */
  serverEntry?: string;
  /** Port for dev/prod server (defaults to 5173) */
  port?: number;
}

export interface LithonoConfig {
  /** Optional tag-to-registration catalog. Client imports are selected per route,
   * not eagerly loaded on every page. Ordinary component imports also work.
   */
  elements?: Record<string, ExternalElementConfig>;
  /** Tag prefix for custom elements, e.g. 'lhc' */
  prefix?: string;
  /** Server entrypoints and runtime options */
  server?: LithonoServerConfig;
  /** Node deployment. Other adapters, including Cloudflare, are unsupported and rejected. */
  adapter?: LithonoAdapter;
  /** `styles` (default): inline whole route sheets once; `none`: hashed links. No critical extraction. */
  inline?: InlinePolicy;
  /** WebMCP agent integration defaults */
  webmcp?: WebMcpGlobalConfig;
  /** Custom options passed to Vite (or a function returning Vite config) */
  vite?: UserConfig | ((env: ConfigEnv) => UserConfig | Promise<UserConfig>);
}

export interface ExternalElementConfig {
  /** Package specifier, @/ source alias, or project-root-relative registration module. */
  import: string;
  /** SSR requires a server-safe module. Browser-only elements retain server fallback content. */
  mode: 'ssr' | 'client-only';
}

export type LithonoConfigFn = (env: ConfigEnv) => LithonoConfig | Promise<LithonoConfig>;
export type LithonoConfigExport = LithonoConfig | Promise<LithonoConfig> | LithonoConfigFn;

/**
 * Type-safe configuration helper for lithono.config.{ts,js}
 */
export function defineConfig(config: LithonoConfigExport): LithonoConfigExport {
  return config;
}

export const CONFIG_CANDIDATES = [
  'lithono.config.ts',
  'lithono.config.js',
  'lithono.config.mjs',
  'lithono.config.cjs',
] as const;

export function resolveConfigFilePath(root: string = process.cwd()): string | undefined {
  for (const candidate of CONFIG_CANDIDATES) {
    const fullPath = resolve(root, candidate);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
}

export async function loadLithonoConfig(
  root: string = process.cwd(),
  env: ConfigEnv = { command: 'serve', mode: 'development' }
): Promise<LithonoConfig> {
  const configFile = resolveConfigFilePath(root);
  if (!configFile) {
    return {};
  }
  try {
    const loaded = await loadConfigFromFile(env, configFile, root);
    if (!loaded?.config) {
      return {};
    }
    const raw: unknown = loaded.config;
    if (typeof raw === 'function') {
      return (await (raw as (env: ConfigEnv) => unknown)(env)) as LithonoConfig;
    }
    return (await raw) as LithonoConfig;
  } catch (error) {
    throw new Error(`[lithono] Failed to load config from ${configFile}`, { cause: error });
  }
}
