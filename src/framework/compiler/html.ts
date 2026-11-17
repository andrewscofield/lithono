import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { parseFragment } from 'parse5';
import MagicString from 'magic-string';
import type { DefaultTreeAdapterMap } from 'parse5';
import { classNameFromTag, kindFromBase, tagFromPageFile, type RouteKindName } from './tags.ts';
import { collectLoaderKeys } from './scope.ts';
import { tagFromModuleId } from '../element-id.ts';
import { cssPublicPath } from './files.ts';
import {
  analyzeModule,
  diagnostic,
  escapeLiteral,
  interpolations,
  maskExpressions,
  parseJavaScript,
} from './parser.ts';
import {
  generatedText,
  joinText,
  originalText,
  replaceText,
  sliceText,
  sourceMap,
  type MappedText,
} from './maps.ts';
import {
  assertFragmentExpressions,
  fragmentFilesForTag,
  isHtmlCssFragment,
  omitUnboundFragmentMapped,
  resolveElementImport,
  rewriteFragmentMapped,
} from './fragments.ts';

type ChildNode = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
type Template = DefaultTreeAdapterMap['template'];

export type CompileKind = RouteKindName | 'component';

export interface CompiledHtml {
  code: string;
  map: object | null;
  tagName: string;
  hydrate: boolean;
  loaderKeys: string[];
  watchFiles: string[];
  childTags: string[];
  hydrationReasons?: string[];
  registration?: { kind: string; tagName: string; className?: string };
  dependencies?: { imports: string[]; styles: string[]; files: string[] };
}

interface CompileOptions {
  file: string;
  kind: CompileKind;
  hydrateOverride?: boolean;
  hasActions?: boolean;
  cssUrl?: string | null;
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const IDENT = /^[A-Za-z_$][\w$]*$/;

function isElement(node: ChildNode): node is Element {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}

function isTemplate(node: ChildNode): node is Template {
  return node.nodeName === 'template';
}

function getAttr(el: Element, name: string): string | undefined {
  return el.attrs.find((attr) => attr.name === name)?.value;
}

function isCustomElementTag(tag: string): boolean {
  return tag.includes('-');
}

function isEmpty(el: Element): boolean {
  if (el.childNodes.length === 0) return true;
  return el.childNodes.every(
    (child) => child.nodeName === '#text' && !('value' in child && String(child.value).trim())
  );
}

interface TransformContext {
  kind: CompileKind;
  extraExprs: string[];
  loopVars: Set<string>;
  fromFile: string;
  fragmentStyles: Set<string>;
  watchFiles: Set<string>;
  expanding: Set<string>;
  childTags: Set<string>;
  needsRepeat: boolean;
  hasEvents: boolean;
}

const VIRTUAL_TAGS = new Set(['lithono-if', 'lithono-each', 'slot']);

const BOOLEAN_ATTRS = new Set([
  'checked',
  'selected',
  'disabled',
  'required',
  'hidden',
  'readonly',
  'multiple',
  'autofocus',
  'toolautosubmit',
]);

function unwrapExpr(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('${') && trimmed.endsWith('}')) {
    return trimmed.slice(2, -1).trim();
  }
  return trimmed;
}

function repeatKeyExpr(as: string, key: string): string {
  if (IDENT.test(key)) return `${as}[${JSON.stringify(key)}] ?? index`;
  throw new Error(`Lithono: <lithono-each key> must be a property name, got "${key}"`);
}

function transformBody(
  source: string,
  kind: CompileKind,
  outer?: TransformContext,
  fromFile = '',
  provenance?: MappedText
): {
  html: string;
  extraExprs: string[];
  loopVars: Set<string>;
  fragmentStyles: Set<string>;
  watchFiles: Set<string>;
  childTags: Set<string>;
  needsRepeat: boolean;
  hasEvents: boolean;
  ms: MagicString;
  mapped: MappedText;
} {
  const ctx: TransformContext = outer ?? {
    kind,
    extraExprs: [],
    loopVars: new Set(),
    fromFile,
    fragmentStyles: new Set(),
    watchFiles: new Set(),
    expanding: new Set(),
    childTags: new Set(),
    needsRepeat: false,
    hasEvents: false,
  };

  const input = provenance ?? originalText(source, fromFile || ctx.fromFile);
  const spans = interpolations(source, fromFile || ctx.fromFile);
  // Structural directives must behave like inert templates during HTML parsing.
  // Custom tags are discarded in selects and foster-parented out of tables.
  // Pad the shorter name so original offsets/maps remain exact.
  const masked = maskExpressions(source, fromFile || ctx.fromFile).replace(
    /<(\/?)(lithono-if|lithono-each)(?=[\s>])/g,
    (_, slash: string, name: string) => `<${slash}${'template'.padEnd(name.length)}`,
  );
  const context = parseFragment('<template></template>').childNodes[0] as Template;
  const ast = parseFragment(context, masked, {
    sourceCodeLocationInfo: true,
  });
  const ops: { start: number; end: number; text: string; mapped?: MappedText }[] = [];

  function walk(nodes: ChildNode[]): void {
    for (const node of nodes) {
      if (isTemplate(node)) {
        const offset = node.sourceCodeLocation?.startOffset;
        const directive = offset == null ? undefined : /^<(lithono-if|lithono-each)(?=[\s>])/.exec(source.slice(offset))?.[1];
        if (directive) {
          node.nodeName = directive as 'template';
          node.childNodes = node.content.childNodes;
        }
      }
      if (isTemplate(node)) {
        const ifExpr = getAttr(node, 'if');
        const eachExpr = getAttr(node, 'each');
        if (ifExpr || eachExpr) {
          throw new Error(
            'Lithono: <template if> / <template each> are gone. Use <lithono-if when="..."> and <lithono-each items="..." as="item">'
          );
        }
        walk(node.content.childNodes);
        continue;
      }

      if (!isElement(node)) continue;

      const loc = node.sourceCodeLocation;
      if (node.attrs.some((attr) => attr.name.startsWith('@'))) ctx.hasEvents = true;
      // HTML must never tokenize JavaScript quotes, angle brackets or whitespace.
      // Recover expression-bearing attribute values from their original spans.
      for (const attr of node.attrs) {
        const attrLoc = loc?.attrs?.[attr.name];
        if (
          !attrLoc ||
          !spans.some((span) => span.start >= attrLoc.startOffset && span.end <= attrLoc.endOffset)
        )
          continue;
        const original = source.slice(attrLoc.startOffset, attrLoc.endOffset);
        let value = original.slice(original.indexOf('=') + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        )
          value = value.slice(1, -1);
        attr.value = value;
      }

      const fail: (message: string) => never = (message) => {
        throw diagnostic(fromFile || ctx.fromFile, source, loc?.startOffset ?? 0, message);
      };
      const fragment = fragmentFilesForTag(node.nodeName, ctx.fromFile);
      if (fragment && loc?.startTag && loc.endTag) {
        if (ctx.expanding.has(node.nodeName)) {
          fail(`fragment <${node.nodeName}> includes itself`);
        }
        ctx.watchFiles.add(fragment.htmlFile);
        if (fragment.cssHref) ctx.fragmentStyles.add(fragment.cssHref);
        const cssFile = fragment.htmlFile.replace(/\.html$/, '.css');
        if (existsSync(cssFile)) ctx.watchFiles.add(cssFile);
        ctx.expanding.add(node.nodeName);
        const bindings = new Map<string, string>();
        const bindingMappings = new Map<string, MappedText>();
        for (const attr of node.attrs) {
          if (!IDENT.test(attr.name)) continue;
          if (attr.value.startsWith('${') && attr.value.endsWith('}')) {
            const expr = unwrapExpr(attr.value);
            bindings.set(attr.name, expr);
            const attrLoc = loc.attrs?.[attr.name];
            if (attrLoc) {
              const start = source.indexOf(expr, attrLoc.startOffset);
              if (start >= 0 && start + expr.length <= attrLoc.endOffset)
                bindingMappings.set(attr.name, sliceText(input, start, start + expr.length));
            }
            ctx.extraExprs.push(expr);
          } else {
            bindings.set(attr.name, JSON.stringify(attr.value));
          }
        }
        const fragmentSource = readFileSync(fragment.htmlFile, 'utf8');
        assertFragmentExpressions(fragmentSource, fragment.htmlFile);
        const pruned = omitUnboundFragmentMapped(
          originalText(fragmentSource, fragment.htmlFile),
          bindings
        );
        const bound = rewriteFragmentMapped(
          pruned,
          bindings,
          sliceText(input, loc.startTag.endOffset, loc.endTag.startOffset),
          bindingMappings
        );
        const nested = transformBody(bound.text, kind, ctx, fragment.htmlFile, bound);
        ctx.expanding.delete(node.nodeName);
        ops.push({
          start: loc.startOffset,
          end: loc.endOffset,
          text: nested.html,
          mapped: nested.mapped,
        });
        continue;
      }

      if (isCustomElementTag(node.nodeName) && !VIRTUAL_TAGS.has(node.nodeName)) {
        ctx.childTags.add(node.nodeName);
      }

      if (node.nodeName === 'lithono-if' || node.nodeName === 'lithono-each') {
        if (!loc?.startTag || !loc.endTag) {
          fail(`<${node.nodeName}> is missing source locations`);
        }
        const inner = source.slice(loc.startTag.endOffset, loc.endTag.startOffset);
        const nested = transformBody(
          inner,
          kind,
          ctx,
          fromFile,
          sliceText(input, loc.startTag.endOffset, loc.endTag.startOffset)
        );

        if (node.nodeName === 'lithono-if') {
          const whenRaw = getAttr(node, 'when');
          if (whenRaw == null || !whenRaw.trim()) {
            fail('<lithono-if> needs a when="..." expression');
          }
          const whenExpr = unwrapExpr(whenRaw);
          ctx.extraExprs.push(whenExpr);
          ops.push({
            start: loc.startOffset,
            end: loc.endOffset,
            text: `\${${whenExpr} ? html\`${nested.html}\` : nothing}`,
          });
        } else {
          const itemsRaw = getAttr(node, 'items');
          if (itemsRaw == null || !itemsRaw.trim()) {
            fail('<lithono-each> needs an items="..." expression');
          }
          const itemsExpr = unwrapExpr(itemsRaw);
          ctx.extraExprs.push(itemsExpr);
          const as = getAttr(node, 'as')?.trim() || 'item';
          if (!IDENT.test(as)) {
            fail(`<lithono-each as> must be an identifier, got "${as}"`);
          }
          ctx.loopVars.add(as);
          try {
            parseJavaScript(`let ${as};`, 'loop.js');
          } catch {
            fail(`<lithono-each as> must be a valid JavaScript binding, got "${as}"`);
          }
          ctx.loopVars.add('index');
          const key = getAttr(node, 'key')?.trim();
          const itemsList = `Array.isArray(${itemsExpr}) ? ${itemsExpr} : []`;
          if (key) {
            ctx.needsRepeat = true;
            ops.push({
              start: loc.startOffset,
              end: loc.endOffset,
              text: `\${repeat(${itemsList}, (${as}, index) => ${repeatKeyExpr(as, key)}, (${as}, index) => html\`${nested.html}\`)}`,
            });
          } else {
            ops.push({
              start: loc.startOffset,
              end: loc.endOffset,
              text: `\${(${itemsList}).map((${as}, index) => html\`${nested.html}\`)}`,
            });
          }
        }
        const op = ops.at(-1)!;
        const nestedAt = op.text.lastIndexOf('`') - nested.html.length;
        op.mapped = joinText(
          generatedText(op.text.slice(0, nestedAt)),
          nested.mapped,
          generatedText(op.text.slice(nestedAt + nested.html.length))
        );
        const exprAttr = node.nodeName === 'lithono-if' ? 'when' : 'items';
        const exprLoc = loc.attrs?.[exprAttr];
        const expr = unwrapExpr(getAttr(node, exprAttr)!);
        if (exprLoc) {
          const originalStart = source.indexOf(expr, exprLoc.startOffset);
          if (originalStart >= 0 && originalStart + expr.length <= exprLoc.endOffset) {
            let start = 0;
            while ((start = op.text.indexOf(expr, start)) !== -1 && start < nestedAt) {
              op.mapped.origins.splice(
                start,
                expr.length,
                ...input.origins.slice(originalStart, originalStart + expr.length)
              );
              start += expr.length;
            }
          }
        }
        continue;
      }

      // Lit's hydratable SSR cannot place child parts in raw-text elements.
      // Keep a normal property part for browser updates and a reflected payload
      // for the SSR adapter to serialize as native textarea default text.
      if (node.nodeName === 'textarea' && loc?.startTag && loc.endTag) {
        const start = loc.startTag.endOffset;
        const end = loc.endTag.startOffset;
        const contentSpans = spans.filter(span => span.start >= start && span.end <= end);
        if (contentSpans.length) {
          const literal = (text: string) => {
            const fragment = parseFragment(`<textarea>_${text}</textarea>`);
            const textarea = fragment.childNodes[0] as DefaultTreeAdapterMap['element'];
            const child = textarea.childNodes[0] as DefaultTreeAdapterMap['textNode'];
            return JSON.stringify(child.value.slice(1));
          };
          const pieces: string[] = [];
          let cursor = start;
          for (const span of contentSpans) {
            if (span.start > cursor) pieces.push(literal(source.slice(cursor, span.start)));
            pieces.push(`(${source.slice(span.start + 2, span.end - 1)})`);
            cursor = span.end;
          }
          if (cursor < end) pieces.push(literal(source.slice(cursor, end)));
          const value = `['', ${pieces.join(', ')}].join('')`;
          ctx.extraExprs.push(value);
          ops.push({ start, end, text: '' });
          ops.push({ start: start - 1, end: start - 1, text: ` data-lithono-textarea=\${${value}} .value=\${${value}}` });
        }
      }
      if (loc?.attrs) {
        for (const attr of node.attrs) {
          const attrLoc = loc.attrs[attr.name];
          if (!attrLoc) continue;
          let value = attr.value;
          if (!value.startsWith('${') || !value.endsWith('}')) continue;
          const original = source.slice(attrLoc.startOffset, attrLoc.endOffset);
          const eq = original.indexOf('=');
          if (eq === -1) continue;
          const name = attr.name === 'selected' && node.nodeName === 'option'
            ? '.selected' : BOOLEAN_ATTRS.has(attr.name) ? `?${attr.name}` : original.slice(0, eq);
          // Selection is live state: changing defaultSelected via an attribute
          // cannot restore a select after the user has changed its selection.
          // nothing omits false on the server and clears the boolean in the client.
          if (name === '.selected') value = `\${(${unwrapExpr(value)}) ? true : nothing}`;
          const attrSpans = spans.filter(
            (span) => span.start >= attrLoc.startOffset && span.end <= attrLoc.endOffset
          );
          ops.push({
            start: attrLoc.startOffset,
            end: attrLoc.endOffset,
            text: `${name}=${value}`,
            mapped: name === '.selected' ? generatedText(`${name}=${value}`) : joinText(
              generatedText(`${name}=`),
              sliceText(input, attrSpans[0]!.start, attrSpans.at(-1)!.end)
            ),
          });
        }
      }
      if (
        (kind === 'layout' || kind === 'page' || kind === 'not-found' || kind === 'error') &&
        node.nodeName === 'slot' &&
        loc
      ) {
        ops.push({ start: loc.startOffset, end: loc.endOffset, text: '${children}' });
        continue;
      }

      if (
        isCustomElementTag(node.nodeName) &&
        !VOID_TAGS.has(node.nodeName) &&
        isEmpty(node) &&
        loc?.endTag
      ) {
        const inner = source.slice(
          loc.startTag?.endOffset ?? loc.startOffset,
          loc.endTag.startOffset
        );
        if (!inner.includes('renderLight')) {
          ops.push({
            start: loc.endTag.startOffset,
            end: loc.endTag.startOffset,
            text: '${renderLight()}',
          });
        }
      }

      if (node.childNodes.length) walk(node.childNodes);
    }
  }

  walk(ast.childNodes);
  ops.sort((a, b) => a.start - b.start);
  const ms = new MagicString(source);
  const mapOps = [...ops];
  for (const op of ops) {
    if (op.start === op.end) ms.appendLeft(op.start, op.text);
    else ms.overwrite(op.start, op.end, op.text);
  }
  // Escape only literal source text, never JS expressions or generated nested templates.
  let cursor = 0;
  const protectedSpans = [...spans, ...ops].sort((a, b) => a.start - b.start);
  function escapeRange(start: number, end: number): void {
    for (let i = start; i < end; i++) {
      if (source[i] === '\\' && source.slice(i + 1, i + 3) === '${') {
        ms.overwrite(i, i + 3, '\\${');
        i += 2;
      } else if (source[i] === '\\' || source[i] === '`') {
        const text = escapeLiteral(source[i]!);
        ms.overwrite(i, i + 1, text);
        mapOps.push({
          start: i,
          end: i + 1,
          text,
          mapped: { text, origins: Array(text.length).fill(input.origins[i]) },
        });
      }
    }
  }
  for (const span of protectedSpans) {
    if (span.start > cursor) escapeRange(cursor, span.start);
    cursor = Math.max(cursor, span.end);
  }
  escapeRange(cursor, source.length);
  const html = ms.toString();
  let mapped = input;
  for (const op of mapOps.sort((a, b) => b.start - a.start))
    mapped = replaceText(mapped, op.start, op.end, op.mapped ?? generatedText(op.text));
  return {
    html,
    extraExprs: ctx.extraExprs,
    loopVars: ctx.loopVars,
    fragmentStyles: ctx.fragmentStyles,
    watchFiles: ctx.watchFiles,
    childTags: ctx.childTags,
    needsRepeat: ctx.needsRepeat,
    hasEvents: ctx.hasEvents,
    ms,
    mapped,
  };
}

function siblingTsHydrate(file: string): { hydrate?: boolean; hasActions: boolean } {
  const tsFile = file.replace(/\.html$/, '.ts');
  if (!existsSync(tsFile)) return { hasActions: false };
  const src = readFileSync(tsFile, 'utf8');
  const { hydrate, hasActions } = analyzeModule(src, tsFile);
  return {
    hydrate,
    hasActions,
  };
}

function siblingCssHref(file: string): string | null {
  return cssPublicPath(file) ?? null;
}

export function compileHtmlModule(file: string, source: string, kind?: CompileKind): CompiledHtml {
  if (isHtmlCssFragment(file)) {
    const tagName = tagFromModuleId(file);
    assertFragmentExpressions(source, file);
    const {
      html: body,
      watchFiles,
      fragmentStyles,
      childTags,
    } = transformBody(source, 'component', undefined, file);
    const cssHref = siblingCssHref(file);
    const styles = [...new Set([...(cssHref ? [cssHref] : []), ...fragmentStyles])];
    const code = `export const tagName = ${JSON.stringify(tagName)};\nexport const hydrate = false;\nexport const lithonoStyles = ${JSON.stringify(styles)};\nexport const lithonoChildTags = ${JSON.stringify([...childTags])};\nexport const fragment = ${JSON.stringify(body)};\n`;
    parseJavaScript(code, `${file}.generated.js`);
    return {
      code,
      map: null,
      tagName,
      hydrate: false,
      loaderKeys: [],
      watchFiles: [...watchFiles, file],
      childTags: [...childTags],
      hydrationReasons: ['inlined HTML/CSS fragment'],
      registration: { kind: 'inline fragment', tagName },
      dependencies: { imports: [], styles, files: [...watchFiles, file] },
    };
  }
  const base = basename(file, '.html');
  const resolvedKind: CompileKind =
    kind ?? kindFromBase(base) ?? (file.includes('/src/components/') ? 'component' : 'page');
  const fromTs = resolvedKind === 'component' ? { hasActions: false } : siblingTsHydrate(file);
  return compileHtml(source, {
    file,
    kind: resolvedKind,
    hydrateOverride: fromTs.hydrate,
    hasActions: fromTs.hasActions,
    cssUrl: siblingCssHref(file),
  });
}

export function compileHtml(source: string, options: CompileOptions): CompiledHtml {
  try {
    return compileHtmlInternal(source, options);
  } catch (error) {
    if (error instanceof Error && /^Lithono: .*:\d+:\d+:/.test(error.message)) throw error;
    throw diagnostic(
      options.file,
      source,
      0,
      error instanceof Error ? error.message : String(error)
    );
  }
}

function compileHtmlInternal(source: string, options: CompileOptions): CompiledHtml {
  const { file, kind } = options;
  const {
    html: body,
    fragmentStyles,
    watchFiles,
    childTags,
    needsRepeat,
    hasEvents,
    ms,
    mapped,
  } = transformBody(source, kind, undefined, file);
  const loaderKeys = kind === 'component' ? [] : collectLoaderKeys(body);
  const eventBindings = hasEvents;
  const compilerHydrate = eventBindings || Boolean(options.hasActions);
  const hydrate = options.hydrateOverride ?? compilerHydrate;
  const tagName = kind === 'component' ? tagFromModuleId(file) : tagFromPageFile(file, kind);
  const className = `Generated${classNameFromTag(tagName) || 'Element'}`;
  const baseClass = kind === 'layout' ? 'LithonoLayout' : 'LithonoPage';

  const needsNothing = body.includes('nothing');
  const needsNoChange = kind === 'layout';
  const needsRenderLight = body.includes('renderLight');
  const clientImports = [
    'html',
    ...(needsNothing ? ['nothing'] : []),
    ...(needsNoChange ? ['noChange'] : []),
    ...(needsRepeat ? ['repeat'] : []),
    ...(needsRenderLight ? ['renderLight'] : []),
    ...(body.includes('unsafeHTML') ? ['unsafeHTML'] : []),
    kind === 'layout' ? 'LithonoLayout' : 'LithonoPage',
    'redefineCustomElement',
  ];

  const scopePrelude =
    kind === 'component'
      ? ''
      : `    const params = this.params;
    const url = this.pageUrl;
${kind === 'layout' ? '    const children = this.pageChildren ?? noChange;\n' : '    const actions = this.actionMap;\n'}    const data = this.data ?? {};
${loaderKeys.map((key) => `    const ${key} = data[${JSON.stringify(key)}];`).join('\n')}
`;

  const cssHref = options.cssUrl;
  const styles = [...new Set([...(cssHref ? [cssHref] : []), ...fragmentStyles])];
  const stylesLiteral = JSON.stringify(styles);

  const childTagList = [...childTags].filter((tag) => tag !== tagName);
  const childImports = childTagList
    .map((tag) => resolveElementImport(tag, file))
    .filter((spec): spec is string => Boolean(spec))
    .map((spec) => `import ${JSON.stringify(spec)};`)
    .join('\n');
  const childTagsLiteral = JSON.stringify(childTagList);

  const preamble = `import { ${clientImports.join(', ')} } from 'lithono/client';
${childImports ? `${childImports}\n` : ''}
export const tagName = ${JSON.stringify(tagName)};
export const hydrate = ${hydrate ? 'true' : 'false'};
export const lithonoStyles = ${stylesLiteral};
export const lithonoChildTags = ${childTagsLiteral};

export default class ${className} extends ${baseClass} {
  static tagName = tagName;
  static hydrate = hydrate;
  static lithonoStyles = lithonoStyles;
  static lithonoChildTags = lithonoChildTags;

  render() {
${kind === 'component' ? '' : scopePrelude}    return html\``;

  const footer = `\`;
  }
}

redefineCustomElement(tagName, ${className});
`;

  ms.prepend(preamble).append(footer);
  const output = joinText(generatedText(preamble), mapped, generatedText(footer));
  parseJavaScript(ms.toString(), `${file}.generated.js`, output);

  return {
    code: ms.toString(),
    map: sourceMap(output),
    tagName,
    hydrate,
    loaderKeys,
    watchFiles: [
      ...watchFiles,
      file,
      ...(existsSync(file.replace(/\.html$/, '.ts')) ? [file.replace(/\.html$/, '.ts')] : []),
    ],
    childTags: childTagList,
    hydrationReasons:
      options.hydrateOverride !== undefined
        ? [`explicit hydrate = ${options.hydrateOverride}`]
        : [
            ...(eventBindings ? ['event bindings'] : []),
            ...(options.hasActions ? ['exported actions'] : []),
            ...(!compilerHydrate ? ['static template'] : []),
          ],
    registration: { kind: 'redefineCustomElement', tagName, className },
    dependencies: {
      imports: childTagList
        .map((tag) => resolveElementImport(tag, file))
        .filter((spec): spec is string => Boolean(spec)),
      styles,
      files: [
        ...watchFiles,
        file,
        ...(existsSync(file.replace(/\.html$/, '.ts')) ? [file.replace(/\.html$/, '.ts')] : []),
      ],
    },
  };
}

export function compileComponentRender(
  file: string,
  source: string
): {
  renderMethod: string;
  imports: string[];
  childTags: string[];
  mappedRender: MappedText;
} {
  const {
    html: body,
    childTags,
    needsRepeat,
    mapped,
  } = transformBody(source, 'component', undefined, file);
  const needsNothing = body.includes('nothing');
  const needsRenderLight = body.includes('renderLight');
  const tagName = tagFromModuleId(file);
  const childTagList = [...childTags].filter((tag) => tag !== tagName);
  const imports = [`import { html${needsNothing ? ', nothing' : ''} } from 'lit';`];
  if (needsRepeat) {
    imports.push(`import { repeat } from 'lit/directives/repeat.js';`);
  }
  if (needsRenderLight) {
    imports.push(`import { renderLight } from 'lithono/client';`);
  }
  if (body.includes('unsafeHTML')) {
    imports.push(`import { unsafeHTML } from 'lit/directives/unsafe-html.js';`);
  }
  for (const tag of childTagList) {
    const spec = resolveElementImport(tag, file);
    if (spec) imports.push(`import ${JSON.stringify(spec)};`);
  }
  parseJavaScript(
    `${imports.join('\n')}\nconst __render = function () { return html\`${body}\`; };`,
    `${file}.generated.js`
  );
  return {
    imports,
    renderMethod: `function () { return html\`${body}\`; }`,
    mappedRender: joinText(
      generatedText('function () { return html`'),
      mapped,
      generatedText('`; }')
    ),
    childTags: childTagList,
  };
}

export function isTrioHtml(file: string): boolean {
  const posix = file.replaceAll('\\', '/').split('?')[0] ?? file;
  if (!posix.endsWith('.html')) return false;
  const base = basename(posix, '.html');
  if (posix.includes('/src/pages/')) {
    return Boolean(kindFromBase(base));
  }
  if (posix.includes('/src/components/')) {
    if (isHtmlCssFragment(posix) || isHtmlCssFragment(file)) return false;
    const dir = basename(dirname(posix));
    return base === dir || isCustomElementTag(base);
  }
  return false;
}
