import { existsSync, readFileSync } from 'node:fs';
import MagicString from 'magic-string';
import ts from 'typescript-parser';
import { compileComponentRender } from './html.ts';
import { cssPublicPath } from './files.ts';
import { tagFromModuleId } from '../element-id.ts';
import { analyzeModule, diagnostic, parseModule } from './parser.ts';
import {
  generatedText,
  joinText,
  originalText,
  replaceText,
  sourceMap,
  type MappedText,
} from './maps.ts';

/** Map-bearing API for transform consumers; the legacy string API remains compatible. */
export function injectComponentTrioResult(
  file: string,
  code: string
): { code: string; map: object } | null {
  const htmlFile = file.replace(/\.ts$/, '.html');
  const cssFile = file.replace(/\.ts$/, '.css');
  const hasHtml = existsSync(htmlFile);
  const hasCss = existsSync(cssFile);
  const analysis = analyzeModule(code, file);
  const expectedTag = tagFromModuleId(file);
  const decoTag = analysis.customElementTag;
  if (decoTag && decoTag !== expectedTag)
    throw diagnostic(
      file,
      code,
      analysis.classNode?.getStart() ?? 0,
      `@customElement('${decoTag}') must match filename tag '${expectedTag}'`
    );
  const ms = new MagicString(code);
  let mapped = originalText(code, file);
  let className = analysis.className;
  if (analysis.classNode && !className) {
    className = '__LithonoDefaultElement';
    while (code.includes(className)) className += '_';
    const token = analysis.classNode
      .getChildren()
      .find((node) => node.kind === ts.SyntaxKind.ClassKeyword)!;
    ms.appendLeft(token.end, ` ${className}`);
    mapped = replaceText(mapped, token.end, token.end, generatedText(` ${className}`));
  }
  if ((hasHtml || hasCss) && !analysis.classNode)
    throw diagnostic(file, code, 0, 'Component trio requires a default-exported class');
  const ast = parseModule(code, file);
  const imported = new Set<string>();
  for (const node of ast.statements)
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.name) imported.add(clause.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const item of clause.namedBindings.elements) imported.add(item.name.text);
    }
  const preamble: string[] = [];
  const footer: string[] = [];
  const mappedFooter: MappedText[] = [];
  function addImport(line: string): void {
    const node = parseModule(line).statements[0];
    if (node && ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        const missing = bindings.elements.filter((item) => !imported.has(item.name.text));
        for (const item of missing) imported.add(item.name.text);
        if (missing.length)
          preamble.push(
            `import { ${missing.map((item) => item.getText()).join(', ')} } from ${node.moduleSpecifier.getText()};`
          );
      } else if (!analysis.imports.includes((node.moduleSpecifier as ts.StringLiteral).text))
        preamble.push(line);
    }
  }
  if (hasHtml && className) {
    const compiled = compileComponentRender(htmlFile, readFileSync(htmlFile, 'utf8'));
    compiled.imports.forEach(addImport);
    footer.push(`${className}.prototype.render = ${compiled.renderMethod};`);
    mappedFooter.push(
      joinText(
        generatedText(`\n${className}.prototype.render = `),
        compiled.mappedRender,
        generatedText(';')
      )
    );
    if (compiled.childTags.length)
      footer.push(`${className}.lithonoChildTags = ${JSON.stringify(compiled.childTags)};`);
  }
  if (hasCss && className) {
    const href = cssPublicPath(file);
    if (href) footer.push(`${className}.lithonoStyles = [${JSON.stringify(href)}];`);
  }
  if (!analysis.hasCustomElement && className && analysis.classNode && expectedTag.includes('-')) {
    addImport(`import { defineFromFilename } from 'lithono/client';`);
    footer.push(`defineFromFilename(${JSON.stringify(expectedTag)}, ${className});`);
  }
  if (!preamble.length && !footer.length) return null;
  if (preamble.length) ms.prepend(`${preamble.join('\n')}\n`);
  if (footer.length) ms.append(`\n${footer.join('\n')}\n`);
  parseModule(ms.toString(), file);
  // The render assignment is the first footer entry when present.
  const tail = mappedFooter.length
    ? joinText(
        mappedFooter[0]!,
        generatedText(`${footer.length > 1 ? '\n' + footer.slice(1).join('\n') : ''}\n`)
      )
    : generatedText(`\n${footer.join('\n')}\n`);
  return {
    code: ms.toString(),
    map: sourceMap(
      joinText(
        generatedText(preamble.length ? `${preamble.join('\n')}\n` : ''),
        mapped,
        footer.length ? tail : generatedText('')
      )
    ),
  };
}

export function injectComponentTrio(file: string, code: string): string | null {
  return injectComponentTrioResult(file, code)?.code ?? null;
}
