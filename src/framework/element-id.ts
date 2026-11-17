export const ELEMENT_GLOBS = [
  'src/components/**/*.ts',
  'src/components/**/*.js',
  'src/components/**/*.mjs',
  'src/framework/animate/elements/**/*.ts',
] as const;

export const ELEMENT_WATCH_DIRS = [
  'src/pages',
  'src/components',
  'src/framework/animate/elements',
] as const;

export function normalizeModuleId(id: string): string {
  return id.replaceAll('\\', '/');
}

export function tagFromModuleId(id: string): string {
  const base = normalizeModuleId(id).split('/').pop() ?? '';
  return base.replace(/\.(ts|js|mjs|html)$/, '').replace(/\.client$/, '').toLowerCase();
}

export function isClientOnlyModule(id: string): boolean {
  return /\.client\.(ts|js|mjs)$/.test(normalizeModuleId(id));
}

export function toPublicModulePath(id: string): string {
  const posix = normalizeModuleId(id);
  const srcIndex = posix.lastIndexOf('/src/');
  if (srcIndex !== -1) {
    return posix.slice(srcIndex);
  }
  if (posix.startsWith('src/')) {
    return `/${posix}`;
  }
  return posix.startsWith('/') ? posix : `/${posix}`;
}
