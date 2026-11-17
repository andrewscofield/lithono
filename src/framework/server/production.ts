/** Replaced by the Vite plugin; this fallback is only for direct Node unit tests. */
export const productionDocument: {
  envelope?: string;
  inline?: import('../types.ts').InlinePolicy;
  manifest: Record<string, { file: string; src?: string; name?: string; imports?: string[]; css?: string[] }>;
  styles: Record<string, { href: string; text: string }>;
} = { manifest: {}, styles: {} };
