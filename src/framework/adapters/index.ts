import type { Plugin, UserConfig, SSROptions } from 'vite';

export interface LithonoAdapter {
  name: string;
  vitePlugins?: Plugin[];
  ssrResolve?: SSROptions['resolve'];
  apply?(config: UserConfig): UserConfig;
}

export function applyAdapter(config: UserConfig, adapter: LithonoAdapter): UserConfig {
  if (adapter.name !== 'node') throw new Error(`Lithono: adapter ${adapter.name} is experimental and unsupported; use node()`);
  if (!adapter.apply) return config;
  return adapter.apply(config);
}

export function node(): LithonoAdapter {
  return { name: 'node' };
}

/** Experimental placeholder. Configuration rejects this adapter explicitly. */
export function cloudflare(): LithonoAdapter {
  return { name: 'cloudflare' };
}
