import ts from 'typescript-parser';
import { parse } from 'acorn';
import type { MappedText } from './maps.ts';

export function diagnostic(file: string, source: string, offset: number, message: string): Error {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return new Error(`Lithono: ${file}:${lines.length}:${lines.at(-1)!.length + 1}: ${message}`);
}

export function parseModule(code: string, file = 'generated.ts'): ts.SourceFile {
  const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const errors = (ast as ts.SourceFile & { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
  if (errors.length) {
    const error = errors[0]!;
    throw diagnostic(
      file,
      code,
      error.start ?? 0,
      ts.flattenDiagnosticMessageText(error.messageText, '\n')
    );
  }
  return ast;
}

/** Generated HTML modules are JavaScript, so enforce ESM early errors as well. */
export function parseJavaScript(code: string, file: string, mapped?: MappedText): void {
  try {
    parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (error) {
    const failure = error as SyntaxError & { pos: number };
    const origin = mapped?.origins[failure.pos];
    throw diagnostic(
      origin?.file ?? file,
      origin?.source ?? code,
      origin?.offset ?? failure.pos,
      failure.message
    );
  }
}

export interface Interpolation {
  start: number;
  end: number;
  expression: string;
}

/** The TS parser owns JS lexical context, including regex and nested template rescans. */
export function interpolations(source: string, file = 'template.html'): Interpolation[] {
  const result: Interpolation[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\\' && source.slice(i + 1, i + 3) === '${') {
      i += 2;
      continue;
    }
    if (source.slice(i, i + 2) !== '${') continue;
    const prefix = 'const __template = `';
    const code = prefix + source.slice(i) + '`;';
    const ast = ts.createSourceFile(
      'expression.ts',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const statement = ast.statements[0];
    const init =
      statement && ts.isVariableStatement(statement)
        ? statement.declarationList.declarations[0]?.initializer
        : undefined;
    const span = init && ts.isTemplateExpression(init) ? init.templateSpans[0] : undefined;
    const close = span ? span.literal.getStart(ast) - prefix.length + i : -1;
    if (!span || close < i + 2 || source[close] !== '}') {
      throw diagnostic(file, source, i, 'Unterminated interpolation');
    }
    const expression = source.slice(i + 2, close);
    try {
      const expressionAst = parse(`(${expression}\n)`, {
        ecmaVersion: 'latest',
        sourceType: 'module',
      });
      if (expressionAst.body.length !== 1 || expressionAst.body[0]?.type !== 'ExpressionStatement')
        throw Object.assign(new SyntaxError('Expected a single expression'), { pos: 1 });
    } catch (error) {
      const failure = error as SyntaxError & { pos: number };
      const offset = Math.max(0, Math.min(expression.length, failure.pos - 1));
      throw diagnostic(file, source, i + 2 + offset, `Invalid interpolation: ${failure.message}`);
    }
    result.push({ start: i, end: close + 1, expression });
    i = close;
  }
  return result;
}

export function maskExpressions(source: string, file?: string): string {
  let masked = source;
  for (const span of interpolations(source, file).reverse()) {
    masked =
      masked.slice(0, span.start) +
      source.slice(span.start, span.end).replace(/[^\n\r]/g, 'x') +
      masked.slice(span.end);
  }
  return masked;
}

export function escapeLiteral(text: string): string {
  // A single backslash before ${ is the template author's literal-marker escape.
  return text
    .replace(/\\\$\{/g, '${')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

export interface ModuleAnalysis {
  className: string | null;
  classNode?: ts.ClassDeclaration;
  customElementTag: string | null;
  hasCustomElement: boolean;
  hydrate?: boolean;
  hasActions: boolean;
  imports: string[];
}

export function analyzeModule(code: string, file: string): ModuleAnalysis {
  const ast = parseModule(code, file);
  const locals = new Map<string, ts.Expression>();
  const exports = new Map<string, ts.Expression>();
  const exportedNames = new Set<string>();
  const classes = new Map<string, ts.ClassDeclaration>();
  const decoratorNames = new Set(['customElement']);
  const namespaces = new Set<string>();
  const imports: string[] = [];
  let defaultName: string | null = null;
  let classNode: ts.ClassDeclaration | undefined;
  const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
    ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === kind);
  for (const node of ast.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings))
        for (const item of bindings.elements) {
          if ((item.propertyName ?? item.name).text === 'customElement')
            decoratorNames.add(item.name.text);
        }
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    }
    if (ts.isVariableStatement(node))
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          locals.set(declaration.name.text, declaration.initializer);
          if (hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
            exports.set(declaration.name.text, declaration.initializer);
            exportedNames.add(declaration.name.text);
          }
        }
      }
    if (ts.isClassDeclaration(node)) {
      if (node.name) classes.set(node.name.text, node);
      if (hasModifier(node, ts.SyntaxKind.DefaultKeyword)) {
        classNode = node;
        defaultName = node.name?.text ?? null;
      }
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals && ts.isIdentifier(node.expression))
      defaultName = node.expression.text;
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      hasModifier(node, ts.SyntaxKind.ExportKeyword)
    )
      exportedNames.add(node.name.text);
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause))
      for (const item of node.exportClause.elements)
        if (!node.isTypeOnly && !item.isTypeOnly) exportedNames.add(item.name.text);
  }
  for (const node of ast.statements)
    if (
      ts.isExportDeclaration(node) &&
      !node.moduleSpecifier &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const item of node.exportClause.elements) {
        const local = (item.propertyName ?? item.name).text;
        const value = locals.get(local);
        if (value) exports.set(item.name.text, value);
        if (item.name.text === 'default') defaultName = local;
      }
    }
  classNode ??= defaultName ? classes.get(defaultName) : undefined;
  const seen = new Set<ts.Expression>();
  const unwrap = (value: ts.Expression): ts.Expression => {
    if (seen.has(value)) return value;
    seen.add(value);
    return ts.isParenthesizedExpression(value) ||
      ts.isAsExpression(value) ||
      ts.isSatisfiesExpression(value) ||
      ts.isTypeAssertionExpression(value)
      ? unwrap(value.expression)
      : ts.isIdentifier(value) && locals.has(value.text)
        ? unwrap(locals.get(value.text)!)
        : value;
  };
  let customElementTag: string | null = null;
  let hasCustomElement = false;
  if (classNode)
    for (const decorator of ts.getDecorators(classNode) ?? []) {
      const call = decorator.expression;
      if (!ts.isCallExpression(call)) continue;
      const callee = call.expression;
      const matches = ts.isIdentifier(callee)
        ? decoratorNames.has(callee.text)
        : ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          namespaces.has(callee.expression.text) &&
          callee.name.text === 'customElement';
      const arg = call.arguments[0];
      if (matches) {
        hasCustomElement = true;
        seen.clear();
        const value = arg ? unwrap(arg) : undefined;
        if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)))
          customElementTag = value.text;
      }
    }
  seen.clear();
  const hydrate = exports.get('hydrate');
  const value = hydrate ? unwrap(hydrate) : undefined;
  return {
    className: defaultName,
    classNode,
    customElementTag,
    hasCustomElement,
    hydrate:
      value?.kind === ts.SyntaxKind.TrueKeyword
        ? true
        : value?.kind === ts.SyntaxKind.FalseKeyword
          ? false
          : undefined,
    hasActions: exportedNames.has('actions'),
    imports,
  };
}
