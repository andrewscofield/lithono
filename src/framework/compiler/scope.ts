import ts from 'typescript-parser';
import { interpolations, maskExpressions, parseModule } from './parser.ts';
import { parseFragment } from 'parse5';

const GLOBALS = new Set([
  'undefined',
  'NaN',
  'Infinity',
  'html',
  'nothing',
  'noChange',
  'repeat',
  'renderLight',
  'unsafeHTML',
  'Math',
  'JSON',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Date',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'RegExp',
  'Error',
  'URL',
  'URLSearchParams',
  'Intl',
  'Symbol',
  'BigInt',
  'console',
  'window',
  'document',
  'globalThis',
  'crypto',
  'event',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURIComponent',
  'decodeURIComponent',
  'eval',
  'arguments',
  'fetch',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'queueMicrotask',
]);
export const PAGE_SCOPE = new Set(['params', 'url', 'actions', 'children', 'data']);
export function extractExpressions(source: string): string[] {
  return interpolations(source).map((span) => span.expression);
}

/** A two-pass lexical scope tree: declarations are visible regardless of source order. */
export function freeIdents(expr: string): string[] {
  const ast = parseModule(`const __expression = (${expr}\n);`, 'expression.ts');
  interface Scope {
    parent?: Scope;
    names: Set<string>;
    functionScope: boolean;
  }
  const root: Scope = { names: new Set(), functionScope: true };
  const scopes = new Map<ts.Node, Scope>();
  const declarationIds = new Set<ts.Node>();
  function bind(name: ts.BindingName, scope: Scope): void {
    if (ts.isIdentifier(name)) {
      scope.names.add(name.text);
      declarationIds.add(name);
    } else
      for (const element of name.elements)
        if (ts.isBindingElement(element)) bind(element.name, scope);
  }
  function build(node: ts.Node, scope: Scope): void {
    const outerScope = scope;
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name)
      bind(node.name, scope);
    const isFunction = ts.isFunctionLike(node);
    if (
      isFunction ||
      ts.isBlock(node) ||
      ts.isCatchClause(node) ||
      ts.isClassLike(node) ||
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isCaseBlock(node)
    )
      scope = {
        parent: scope,
        names: new Set(),
        functionScope:
          isFunction ||
          (ts.isBlock(node) &&
            ts.isFunctionLike(node.parent) &&
            'body' in node.parent &&
            node.parent.body === node),
      };
    scopes.set(node, scope);
    if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name)
      bind(node.name, scope);
    if (ts.isParameter(node)) bind(node.name, scope);
    if (ts.isVariableDeclaration(node)) {
      let target = scope;
      if (
        ts.isVariableDeclarationList(node.parent) &&
        !(node.parent.flags & ts.NodeFlags.BlockScoped)
      )
        while (!target.functionScope && target.parent) target = target.parent;
      bind(node.name, target);
    }
    ts.forEachChild(node, (child) =>
      build(child, isFunction && 'name' in node && child === node.name ? outerScope : scope)
    );
  }
  const expression = (ast.statements[0] as ts.VariableStatement).declarationList.declarations[0]!
    .initializer!;
  build(expression, root);
  const found = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node) && !declarationIds.has(node)) {
      const p = node.parent;
      const property =
        (ts.isPropertyAccessExpression(p) && p.name === node) ||
        ((ts.isPropertyAssignment(p) ||
          ts.isMethodDeclaration(p) ||
          ts.isPropertyDeclaration(p) ||
          ts.isGetAccessorDeclaration(p) ||
          ts.isSetAccessorDeclaration(p) ||
          ts.isBindingElement(p)) &&
          p.name === node &&
          !ts.isShorthandPropertyAssignment(p)) ||
        (ts.isBindingElement(p) && p.propertyName === node) ||
        ts.isLabeledStatement(p) ||
        ts.isBreakStatement(p) ||
        ts.isContinueStatement(p);
      if (!property && !GLOBALS.has(node.text)) {
        let scope: Scope | undefined = scopes.get(node);
        while (scope && !scope.names.has(node.text)) scope = scope.parent;
        if (!scope) found.add(node.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(expression);
  return [...found];
}

export function collectLoaderKeys(
  source: string,
  extraExprs: string[] = [],
  loopVars: Iterable<string> = []
): string[] {
  const keys = new Set<string>();
  const skip = new Set(loopVars);
  for (const expr of [...extractExpressions(source), ...extraExprs])
    for (const name of freeIdents(expr))
      if (!PAGE_SCOPE.has(name) && !skip.has(name)) keys.add(name);
  return [...keys].sort();
}

interface WalkableNode {
  attrs?: { name: string }[];
  childNodes?: WalkableNode[];
  content?: WalkableNode;
}

export function hasEventBindings(source: string): boolean {
  const ast = parseFragment(maskExpressions(source)) as WalkableNode;
  function walk(node: WalkableNode): boolean {
    return (
      Boolean(node.attrs?.some((attr) => attr.name.startsWith('@'))) ||
      (node.childNodes ?? []).some(walk) ||
      Boolean(node.content && walk(node.content))
    );
  }
  return walk(ast);
}
