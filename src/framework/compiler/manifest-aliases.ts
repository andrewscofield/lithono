interface ManifestChunk {
  file: string;
  src?: string;
  imports?: string[];
  css?: string[];
  [key: string]: unknown;
}

/** A static import can coalesce a dynamic entry into another chunk. Preserve
 * source identity from the bundler's actual module membership, never file names. */
export function addManifestAliases(
  manifest: Record<string, ManifestChunk>,
  chunks: Iterable<{ fileName: string; modules: Record<string, unknown> }>,
  sources: Map<string, string>,
): void {
  for (const chunk of chunks) {
    const entry = Object.values(manifest).find(value => value.file === chunk.fileName);
    if (!entry) continue;
    for (const id of Object.keys(chunk.modules)) {
      const source = sources.get(id);
      if (source && !manifest[source]) manifest[source] = { ...entry, src: source };
    }
  }
}
