export const PAGE_RESERVED = ['page', 'layout', 'middleware', 'not-found', 'error'] as const;
export type PageReserved = (typeof PAGE_RESERVED)[number];

export type RouteKindName = 'page' | 'layout' | 'not-found' | 'error';

export function isGroupSegment(seg: string): boolean {
  return seg.startsWith('(') && seg.endsWith(')');
}

export function isReservedPageBase(base: string): base is PageReserved {
  return (PAGE_RESERVED as readonly string[]).includes(base);
}

export function posixPath(file: string): string {
  return file.replaceAll('\\', '/');
}

export function pagesRel(file: string): string {
  const posix = posixPath(file);
  const marker = '/src/pages/';
  const index = posix.lastIndexOf(marker);
  if (index !== -1) return posix.slice(index + marker.length);
  return posix.replace(/^\.?\//, '').replace(/^src\/pages\//, '');
}

function stripDynamic(seg: string): string {
  if (seg.startsWith('[...') && seg.endsWith(']')) return seg.slice(4, -1);
  if (seg.startsWith('[') && seg.endsWith(']')) return seg.slice(1, -1);
  return seg;
}

function routeDirFromRel(rel: string): string {
  const withoutExt = rel.replace(/\.(html|ts|css)$/, '');
  const parts = withoutExt.split('/');
  const last = parts.at(-1);
  if (last && isReservedPageBase(last)) parts.pop();
  return parts.filter((seg) => seg && !isGroupSegment(seg)).map(stripDynamic).join('/');
}

export function tagFromPageFile(file: string, kind: RouteKindName): string {
  const dir = routeDirFromRel(pagesRel(file));
  const prefix = `lithono-${kind}`;
  // Custom element names are ASCII-lowercase. A dynamic segment like [cycleId]
  // would otherwise register a mixed-case tag the HTML parser never upgrades.
  const tag = dir ? `${prefix}-${dir.replaceAll('/', '-')}` : prefix;
  return tag.toLowerCase();
}

export function classNameFromTag(tag: string): string {
  return tag
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function kindFromBase(base: string): RouteKindName | null {
  if (base === 'page' || base === 'layout' || base === 'not-found' || base === 'error') return base;
  return null;
}

function sanitizeAssetStem(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'chunk';
}

/** `src/pages/lists/[id]/page.html` → `lists-id-page` */
export function clientPageAssetStem(file: string): string {
  const rel = pagesRel(file).replace(/\.(html|ts)$/, '');
  const parts = rel
    .split('/')
    .filter((seg) => seg && !isGroupSegment(seg))
    .map((seg) => {
      if (seg.startsWith('[...') && seg.endsWith(']')) return seg.slice(4, -1);
      if (seg.startsWith('[') && seg.endsWith(']')) return seg.slice(1, -1);
      return seg;
    });
  return sanitizeAssetStem(parts.join('-') || 'page');
}

/** Stable, route-aware name for client chunks (avoids every file being page.html-[hash]). */
export function clientAssetStem(moduleId: string | null | undefined, fallback = 'chunk'): string {
  if (!moduleId) return sanitizeAssetStem(fallback);

  let id = moduleId.replaceAll('\\', '/').replace(/^\0/, '');
  id = id.replace(/^lithono-html:/, '');
  id = id.replace(/\?.*$/, '').replace(/\.js$/, '');

  const srcIndex = id.lastIndexOf('/src/');
  const rel =
    srcIndex !== -1
      ? id.slice(srcIndex + 1)
      : id.startsWith('src/')
        ? id
        : id;

  if (rel.includes('pages/') || rel.startsWith('src/pages/')) {
    const posix = rel.startsWith('src/') ? `/${rel}` : rel;
    return clientPageAssetStem(posix);
  }

  const fileName = rel.split('/').pop() ?? fallback;
  if (fileName.includes('-') || fileName.endsWith('.ts') || fileName.endsWith('.html')) {
    const tag = fileName.replace(/\.(ts|html)$/, '').replace(/\.client$/, '');
    if (tag.includes('-')) return tag;
  }

  if (fileName.startsWith('bootstrap.')) return 'bootstrap';
  return sanitizeAssetStem(rel.replace(/\.(ts|js|html)$/, '').replaceAll('/', '-') || fallback);
}
