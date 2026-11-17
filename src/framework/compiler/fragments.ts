import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { toPublicModulePath } from '../element-id.ts';
import { cssPublicPath } from './files.ts';
import type { ExternalElementConfig } from '../config.ts';
import { extractExpressions } from './scope.ts';
import { diagnostic, interpolations } from './parser.ts';
import {
  generatedText,
  joinText,
  originalText,
  replaceText,
  sliceText,
  type MappedText,
} from './maps.ts';

type ChildNode = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
type Template = DefaultTreeAdapterMap['template'];

const IDENT = /^[A-Za-z_$][\w$]*$/;

const FRAMEWORK_TAGS = new Set(['lithono-if', 'lithono-each', 'slot']);

export function projectRootFromFile(file: string): string {
  const posix = file.replaceAll('\\', '/');
  const index = posix.lastIndexOf('/src/');
  if (index !== -1) return posix.slice(0, index);
  return process.cwd();
}

export function isHtmlCssFragment(file: string): boolean {
  const posix = file.replaceAll('\\', '/').split('?')[0] ?? file;
  if (!posix.endsWith('.html') || !posix.includes('/src/components/')) return false;
  const tsAbs = posix.replace(/\.html$/, '.ts');
  const tsCwd = join(process.cwd(), posix.replace(/^\//, '')).replace(/\.html$/, '.ts');
  if (existsSync(tsAbs) || existsSync(tsCwd)) return false;
  const htmlCwd = join(process.cwd(), posix.replace(/^\//, ''));
  return existsSync(posix) || existsSync(htmlCwd);
}

const FRAMEWORK_ELEMENT_DIRS = ['src/framework/animate/elements'] as const;

const externalElements = new Map<string, Record<string, ExternalElementConfig>>();

/** Vite installs the explicit mapping for this project before compiling templates. */
export function setExternalElements(root: string, elements: Record<string, ExternalElementConfig>): void {
  externalElements.set(root.replaceAll('\\', '/'), elements);
}

function componentModule(root: string, tag: string): string | null {
  for (const extension of ['ts', 'js', 'mjs', 'client.ts', 'client.js', 'client.mjs']) {
    const file = join(root, 'src/components', tag, `${tag}.${extension}`);
    if (existsSync(file)) return file;
  }
  return null;
}

/** Client module for a custom element tag, or null for html/css fragments. */
export function resolveElementImport(tag: string, fromFile: string): string | null {
  if (!tag.includes('-') || tag === 'slot') return null;
  const root = projectRootFromFile(fromFile);
  const external = externalElements.get(root)?.[tag];
  // Registration is lazy through bootstrap, including browser-only modules.
  // Do not inject an eager external import into a server template.
  if (external) return null;
  const componentTs = componentModule(root, tag);
  if (componentTs) return /\.client\.(ts|js|mjs)$/.test(componentTs) ? null : toPublicModulePath(componentTs);
  for (const dir of FRAMEWORK_ELEMENT_DIRS) {
    const file = join(root, dir, `${tag}.ts`);
    if (existsSync(file)) return toPublicModulePath(file);
  }
  return null;
}

export function fragmentFilesForTag(
  tag: string,
  fromFile: string
): { htmlFile: string; cssHref: string | null } | null {
  if (!tag.includes('-') || FRAMEWORK_TAGS.has(tag)) return null;
  const root = projectRootFromFile(fromFile);
  if (externalElements.get(root)?.[tag]) return null;
  const htmlFile = join(root, 'src/components', tag, `${tag}.html`);
  if (!existsSync(htmlFile) || componentModule(root, tag)) return null;
  return { htmlFile, cssHref: cssPublicPath(htmlFile, root) ?? null };
}

function isElement(node: ChildNode): node is Element {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}

function isTemplate(node: ChildNode): node is Template {
  return node.nodeName === 'template';
}

function unwrapExpr(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('${') && trimmed.endsWith('}')) {
    return trimmed.slice(2, -1).trim();
  }
  return trimmed;
}

function ownInterpolations(el: Element): string[] {
  const exprs: string[] = [];
  for (const attr of el.attrs) exprs.push(...extractExpressions(attr.value));
  for (const child of el.childNodes) {
    if (child.nodeName === '#text' && 'value' in child) {
      exprs.push(...extractExpressions(String(child.value)));
    }
  }
  return exprs.map((expr) => unwrapExpr(expr.trim()));
}

/**
 * Drop fragment branches that only exist for attributes the caller omitted.
 * `<page-header title="Listings">` must not emit an empty subtitle `<p>`.
 */
export function omitUnboundFragmentDom(source: string, bindings: Map<string, string>): string {
  return omitUnboundFragmentMapped(originalText(source, 'fragment.html'), bindings).text;
}

export function omitUnboundFragmentMapped(
  input: MappedText,
  bindings: Map<string, string>
): MappedText {
  const source = input.text;
  const ast = parseFragment(source, { sourceCodeLocationInfo: true });
  const ops: { start: number; end: number }[] = [];

  function walk(nodes: ChildNode[]): void {
    for (const node of nodes) {
      if (isTemplate(node)) {
        walk(node.content.childNodes);
        continue;
      }
      if (!isElement(node)) continue;
      const loc = node.sourceCodeLocation;
      if (!loc) continue;

      if (node.nodeName === 'lithono-if') {
        const when = node.attrs.find((attr) => attr.name === 'when')?.value;
        const ident = when ? unwrapExpr(when) : '';
        if (IDENT.test(ident) && ident !== 'children' && !bindings.has(ident)) {
          ops.push({ start: loc.startOffset, end: loc.endOffset });
          continue;
        }
      }

      const interpolations = ownInterpolations(node).filter((expr) => expr !== 'children');
      if (
        interpolations.length > 0 &&
        interpolations.every((expr) => IDENT.test(expr) && !bindings.has(expr))
      ) {
        ops.push({ start: loc.startOffset, end: loc.endOffset });
        continue;
      }

      if (node.childNodes.length) walk(node.childNodes);
    }
  }

  walk(ast.childNodes);
  ops.sort((a, b) => b.start - a.start);
  let html = input;
  for (const op of ops) {
    html = replaceText(html, op.start, op.end, generatedText(''));
  }
  return html;
}

export function rewriteFragmentBindings(
  source: string,
  bindings: Map<string, string>,
  childrenHtml: string
): string {
  return rewriteFragmentMapped(
    originalText(source, 'fragment.html'),
    bindings,
    generatedText(childrenHtml)
  ).text;
}

export function rewriteFragmentMapped(
  input: MappedText,
  bindings: Map<string, string>,
  children: MappedText,
  bindingMappings: Map<string, MappedText> = new Map()
): MappedText {
  const source = input.text;
  const parts: MappedText[] = [];
  let i = 0;
  for (const span of interpolations(source)) {
    parts.push(sliceText(input, i, span.start));
    const trimmed = span.expression.trim();
    if (trimmed === 'children') {
      parts.push(children);
    } else if (bindings.has(trimmed)) {
      parts.push(
        joinText(
          generatedText('${'),
          bindingMappings.get(trimmed) ?? generatedText(bindings.get(trimmed)!),
          generatedText('}')
        )
      );
    } else if (IDENT.test(trimmed)) {
      parts.push(generatedText('${undefined}'));
    } else {
      parts.push(sliceText(input, span.start, span.end));
    }
    i = span.end;
  }
  return joinText(...parts, sliceText(input, i));
}

export function assertFragmentExpressions(source: string, file: string): void {
  for (const span of interpolations(source, file)) {
    const trimmed = span.expression.trim();
    if (trimmed === 'children') continue;
    if (!IDENT.test(trimmed)) {
      throw diagnostic(
        file,
        source,
        span.start,
        `Fragments can only interpolate simple names like \${title} or \${children}, got \${${trimmed}}`
      );
    }
  }
}
