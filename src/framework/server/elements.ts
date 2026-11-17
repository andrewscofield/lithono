import {
  isClientOnlyModule,
  normalizeModuleId,
  tagFromModuleId,
} from '../element-id.ts';

export { tagFromModuleId, toPublicModulePath } from '../element-id.ts';

export interface ElementModule {
  /** Vite glob key, e.g. /src/components/listing-price/listing-price.ts */
  id: string;
  tag: string;
  load: ElementLoader;
  clientOnly: boolean;
}

export type ElementLoader = (() => Promise<unknown>) & {
  tag?: string;
  clientOnly?: boolean;
};

export function buildElementRegistry(
  modules: Record<string, ElementLoader>
): Map<string, ElementModule> {
  const registry = new Map<string, ElementModule>();

  for (const [id, load] of Object.entries(modules)) {
    const posix = normalizeModuleId(id);
    const tag = load.tag ?? tagFromModuleId(id);
    const isPageHtml = /\/src\/pages\/.*\.(html)$/.test(posix);
    if (!tag.includes('-') && !isPageHtml) continue;

    const clientOnly = load.clientOnly ?? isClientOnlyModule(id);
    const key = tag.includes('-') ? tag : posix;
    const existing = registry.get(key);
    if (existing && !existing.clientOnly && clientOnly && !load.tag) {
      continue;
    }

    registry.set(key, { id: posix, tag: key, load, clientOnly });
  }

  return registry;
}

export async function registerServerElements(
  registry: Map<string, ElementModule>
): Promise<void> {
  for (const entry of registry.values()) {
    if (entry.clientOnly) continue;
    try {
      await entry.load();
    } catch (error) {
      throw new Error(
        `Lithono: failed to register <${entry.tag}> on the server from ${entry.id}. ` +
        'Use elements[tag].mode = "client-only" for browser-only modules.',
        { cause: error }
      );
    }
    if (entry.load.tag && !customElements.get(entry.tag)) {
      throw new Error(`Lithono: ${entry.id} did not register configured element <${entry.tag}>.`);
    }
  }
}
