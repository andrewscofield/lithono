import { existsSync, globSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { isReservedPageBase, pagesRel, posixPath } from './tags.ts';

export const PAGE_GLOBS = ['src/pages/**/*.{ts,html,css}'] as const;

const ALLOWED_EXT = new Set(['.ts', '.html', '.css']);

export function listPosix(root: string, pattern: string): string[] {
  return globSync(pattern, { cwd: root })
    .map((file) => file.replaceAll('\\', '/'))
    .sort();
}

export function validatePagesDir(root: string): void {
  for (const file of listPosix(root, 'src/pages/**/*')) {
    const abs = join(root, file);
    try {
      if (statSync(abs).isDirectory()) continue;
    } catch {
      continue;
    }
    if (file.endsWith('.d.ts')) continue;
    const ext = extname(file);
    if (!ALLOWED_EXT.has(ext)) {
      throw new Error(`Lithono: unsupported file in src/pages: ${file}`);
    }
    const base = basename(file, ext);
    if (!isReservedPageBase(base)) {
      throw new Error(
        `Lithono: ${file} is not allowed. Reserved names in src/pages are page, layout, middleware, not-found, and error.`
      );
    }
    if (base === 'middleware' && ext !== '.ts') {
      throw new Error(`Lithono: middleware must be middleware.ts (${file})`);
    }
  }
}

export function listPageTs(root: string): string[] {
  return listPosix(root, 'src/pages/**/*.ts').filter((file) => !file.endsWith('.d.ts'));
}

export function listPageHtml(root: string): string[] {
  return listPosix(root, 'src/pages/**/*.html');
}

export function siblingExists(file: string, ext: '.ts' | '.html' | '.css'): boolean {
  const next = file.replace(/\.(ts|html|css)$/, ext);
  return existsSync(next);
}

export function readOptional(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function cssPublicPath(file: string, root = process.cwd()): string | undefined {
  const css = posixPath(file).replace(/\.(ts|html)$/, '.css');
  const abs = css.startsWith('/') ? css : join(root, css);
  if (!existsSync(abs) && !existsSync(css)) return undefined;
  if (css.includes('/src/')) {
    const index = css.lastIndexOf('/src/');
    return css.slice(index);
  }
  if (css.startsWith('src/')) return `/${css}`;
  return css.startsWith('/') ? css : `/${css}`;
}

export function dirOfPageFile(file: string): string {
  return dirname(pagesRel(file));
}
