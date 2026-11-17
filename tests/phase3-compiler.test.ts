import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript-parser';
import { analyzeModule, interpolations, parseModule } from '../src/framework/compiler/parser.ts';
import { collectLoaderKeys, freeIdents } from '../src/framework/compiler/scope.ts';
import { compileHtml, compileHtmlModule } from '../src/framework/compiler/html.ts';
import { injectComponentTrioResult } from '../src/framework/compiler/inject.ts';
import { rewriteFragmentBindings } from '../src/framework/compiler/fragments.ts';
import { writeInspectOutput } from '../src/framework/compiler/inspect.ts';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const file = '/fixture/src/pages/demo/page.html';
test('structural directives retain native select options and table rows, including nested properties', () => {
  const compiled = compileHtml('<select><lithono-each items="${rows}" as="row" key="id"><option value="${row.id}" selected="${row.active}">${row.name}</option></lithono-each></select><table><tbody><lithono-each items="${rows}" as="row" key="id"><tr><td><lithono-if when="${row.active}"><input .value="${row.name}"></lithono-if></td></tr></lithono-each></tbody></table>', { file, kind: 'page', hydrateOverride: true });
  assert.match(compiled.code, /repeat\(/);
   assert.match(compiled.code, /\.selected=\$\{\(row.active\) \? true : nothing\}/);
  assert.match(compiled.code, /\.value=\$\{row.name\}/);
  assert.match(compiled.code, /<tr><td>\$\{row.active \? html/);
  assert.doesNotMatch(compiled.code, /<lithono-(each|if)/);
  parseModule(compiled.code);
});
function fixture(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'lithono-compiler-'));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('interpolation lexer respects strings, regex, comments and nested templates', () => {
  const expressions = [
    `'}' + "{" + data.value`,
    `/[}]/.test(data.value)`,
    `data.value /* } */ + // }\n data.other`,
    '`outer ${`inner ${data.value}`} }`',
    `(() => { const { value } = data; return { value }; })()`,
  ];
  const source = expressions.map((expr) => '${' + expr + '}').join(' ');
  assert.deepEqual(
    interpolations(source).map((span) => span.expression),
    expressions
  );
  assert.deepEqual(
    interpolations(String.raw`literal \${ignored} and ${'${data.value}'}`).map(
      (span) => span.expression
    ),
    ['data.value']
  );
});

test('free identifiers honor arrow, destructuring, function, catch, block and loop scopes', () => {
  assert.deepEqual(freeIdents('({ [key](key) { return key; } })'), ['key']);
  assert.deepEqual(freeIdents('(function (x = local) { var local = 1; return x + local; })()'), [
    'local',
  ]);
  assert.deepEqual(freeIdents('__expression'), ['__expression']);
  assert.deepEqual(
    freeIdents(
      `rows.map(({id: value, ...rest}, index) => ({ value, index, rest, label: prefix + suffix }))`
    ).sort(),
    ['prefix', 'rows', 'suffix']
  );
  assert.deepEqual(
    freeIdents(
      `(() => { var hoisted; { const scoped = input; } try { throw problem; } catch ({message}) { return message; } return scoped + hoisted; })()`
    ).sort(),
    ['input', 'problem', 'scoped']
  );
  assert.deepEqual(
    freeIdents(`(() => { for (const {id} of rows) { console.log(id); } return id; })()`).sort(),
    ['id', 'rows']
  );
  assert.deepEqual(freeIdents('`hello ${name} ${items.map(item => item.title + suffix)}`').sort(), [
    'items',
    'name',
    'suffix',
  ]);
  assert.deepEqual(
    freeIdents(
      `({ [key]: value, shorthand, method(arg = fallback) { return arg + external; } })`
    ).sort(),
    ['external', 'fallback', 'key', 'shorthand', 'value']
  );
});

test('literal text survives template generation without evaluating escaped markers', () => {
  const source = '<pre>literal `tick` C:\\path \\${ignored}</pre>${data.title}';
  const compiled = compileHtml(source, { file, kind: 'page' });
  const ast = parseModule(compiled.code);
  let template: ts.TaggedTemplateExpression | undefined;
  function find(node: ts.Node): void {
    if (ts.isTaggedTemplateExpression(node)) template = node;
    ts.forEachChild(node, find);
  }
  find(ast);
  assert.ok(template && ts.isTemplateExpression(template.template));
  assert.equal(template.template.head.text, '<pre>literal `tick` C:\\path ${ignored}</pre>');
  assert.deepEqual(compiled.loaderKeys, []);
});

test('HTML tokenizer cannot consume JavaScript quotes or angle brackets', () => {
  const compiled = compileHtml(
    '<button @click="${() => actions.save({value: \"a>b\"})}" disabled="${data.busy}">${rows.map(({name}) => name < limit ? `x${name}` : ">")}</button>',
    { file, kind: 'page' }
  );
  assert.deepEqual(compiled.loaderKeys, ['limit', 'rows']);
  assert.equal(compiled.hydrate, true);
  assert.match(compiled.code, /\?disabled=\$\{data.busy\}/);
  assert.match(compiled.code, /actions.save\(\{value: "a>b"\}\)/);
  parseModule(compiled.code);
  assert.equal(
    compileHtml('${"<button @click=handler>text</button>"}', { file, kind: 'page' }).hydrate,
    false
  );
});

test('each scopes do not leak into siblings and shorthand remains supported', () => {
  const source =
    '<lithono-each items="rows" as="row" key="id"><span>${row.title} ${index} ${suffix}</span></lithono-each><p>${row} ${index}</p>';
  const compiled = compileHtml(source, { file, kind: 'page' });
  assert.deepEqual(compiled.loaderKeys, ['index', 'row', 'rows', 'suffix']);
  assert.match(compiled.code, /const rows = data\["rows"\]/);
  assert.deepEqual(collectLoaderKeys('${data.rows} ${params.id} ${url.pathname}'), []);
});

test('diagnostics identify source file, line and column', () => {
  assert.throws(
    () => compileHtml('<p>first</p>\n${data.}', { file, kind: 'page' }),
    /\/fixture\/src\/pages\/demo\/page.html:2:8: Invalid interpolation/
  );
  assert.throws(
    () => compileHtml('<p>first</p>\n${data', { file, kind: 'page' }),
    /page.html:2:1: Unterminated interpolation/
  );
  assert.throws(() => parseModule('export const value = ;', '/fixture/bad.ts'), /bad.ts:1:22:/);
  assert.throws(
    () => compileHtml('${data.title as string}', { file, kind: 'page' }),
    /Invalid interpolation/
  );
  assert.throws(
    () => compileHtml('${value); sideEffect(); (value}', { file, kind: 'page' }),
    /(Invalid|Unterminated) interpolation/
  );
  assert.throws(
    () =>
      compileHtml('<p>first</p>\n<lithono-each items="data.rows" as="class">x</lithono-each>', {
        file,
        kind: 'page',
      }),
    /page.html:2:1:.*valid JavaScript binding/
  );
});

// Independent source-map consumer: decode v3 VLQ segments at a generated character.
function mappedPosition(
  code: string,
  map: { mappings: string; sources: string[] },
  offset: number
): { file: string; line: number; column: number } | null {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function decode(segment: string): number[] {
    const values: number[] = [];
    let value = 0,
      shift = 0;
    for (const char of segment) {
      const n = alphabet.indexOf(char);
      value += (n & 31) * 2 ** shift;
      if (n & 32) shift += 5;
      else {
        values.push(value & 1 ? -Math.floor(value / 2) : value / 2);
        value = 0;
        shift = 0;
      }
    }
    return values;
  }
  const before = code.slice(0, offset).split('\n');
  const targetLine = before.length - 1,
    targetColumn = before.at(-1)!.length;
  let source = 0,
    line = 0,
    column = 0;
  for (const [generatedLine, encoded] of map.mappings.split(';').entries()) {
    let generatedColumn = 0;
    for (const segment of encoded.split(',').filter(Boolean)) {
      const values = decode(segment);
      generatedColumn += values[0]!;
      if (values.length > 1) {
        source += values[1]!;
        line += values[2]!;
        column += values[3]!;
      }
      if (generatedLine === targetLine && generatedColumn === targetColumn)
        return values.length > 1 ? { file: map.sources[source], line, column } : null;
    }
    if (generatedLine > targetLine) break;
  }
  return null;
}

test('source maps retain exact nested, attribute and expanded fragment positions', () =>
  fixture((root) => {
    const dir = join(root, 'src/components/example-fragment');
    mkdirSync(dir, { recursive: true });
    const fragmentFile = join(dir, 'example-fragment.html');
    const fragment = '<strong>fragment text ${title}</strong>${children}';
    writeFileSync(fragmentFile, fragment);
    const pageFile = join(root, 'src/pages/demo/page.html');
    const source =
      '<lithono-if when="data.visible">\n<button disabled="${data.busy}">nested text</button>\n<example-fragment title="${data.label}"><em>caller text</em></example-fragment>\n</lithono-if>';
    const compiled = compileHtml(source, { file: pageFile, kind: 'page' });
    for (const text of ['data.visible', 'data.busy', 'data.label', 'nested text', 'caller text']) {
      const offset = source.indexOf(text),
        before = source.slice(0, offset).split('\n');
      assert.deepEqual(mappedPosition(compiled.code, compiled.map, compiled.code.indexOf(text)), {
        file: pageFile,
        line: before.length - 1,
        column: before.at(-1)!.length,
      });
    }
    assert.deepEqual(
      mappedPosition(compiled.code, compiled.map, compiled.code.indexOf('fragment text')),
      { file: fragmentFile, line: 0, column: fragment.indexOf('fragment text') }
    );
    assert.equal(
      mappedPosition(compiled.code, compiled.map, compiled.code.indexOf('import {')),
      null
    );
    const repeated = '<lithono-if when="x">x</lithono-if>';
    const repeatedCompiled = compileHtml(repeated, { file: pageFile, kind: 'page' });
    assert.deepEqual(
      mappedPosition(
        repeatedCompiled.code,
        repeatedCompiled.map,
        repeatedCompiled.code.indexOf('html`x') + 5
      ),
      { file: pageFile, line: 0, column: repeated.indexOf('>x') + 1 }
    );
  }));

test('CLI check validates TS modules as well as generated templates', () =>
  fixture((root) => {
    const dir = join(root, 'src/pages/demo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'page.html'), '<p>${data.title}</p>');
    writeFileSync(join(dir, 'page.ts'), 'export const loader = ;');
    const executable = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));
    const cli = fileURLToPath(new URL('../cli/index.ts', import.meta.url));
    assert.throws(
      () => execFileSync(executable, [cli, 'check'], { cwd: root, stdio: 'pipe' }),
      (error: { status?: number; stderr?: Buffer }) => error.status === 1 && Boolean(error.stderr?.toString().includes('page.ts:1:23:'))
    );
    writeFileSync(join(dir, 'page.ts'), 'export const loader = () => ({title: "ok"});');
    assert.match(
      execFileSync(executable, [cli, 'check'], { cwd: root, encoding: 'utf8' }),
      /check passed \(1 templates, 1 TypeScript modules\)/
    );
  }));

test('module analysis ignores comment/string decoys and handles TS exports and decorators', () => {
  const analysis = analyzeModule(
    `
    import { customElement as element } from 'lit/decorators.js';
    const decoy = 'export const hydrate = false; @customElement("wrong-tag")';
    // export const actions = {};
    const enabled: boolean = true as const;
    const handlers = { save() {} } satisfies Record<string, Function>;
    export { enabled as hydrate, handlers as actions };
    @element('right-tag')
    class Element<T> extends Base { value!: T; }
    export { Element as default };
  `,
    '/fixture/right-tag.ts'
  );
  assert.equal(analysis.hydrate, true);
  assert.equal(analysis.hasActions, true);
  assert.equal(analysis.className, 'Element');
  assert.equal(analysis.customElementTag, 'right-tag');
  assert.equal(
    analyzeModule(
      `const TAG = 'right-tag' as const; @customElement(TAG) export default class Element {}`,
      '/fixture/right-tag.ts'
    ).customElementTag,
    'right-tag'
  );
  assert.equal(
    analyzeModule(
      `@customElement(tagFactory()) export default class Element {}`,
      '/fixture/right-tag.ts'
    ).hasCustomElement,
    true
  );
  assert.equal(
    analyzeModule(`const text = 'export const actions = {}';`, 'decoy.ts').hasActions,
    false
  );
});

test('component injection handles anonymous classes and imported render helpers', () =>
  fixture((root) => {
    const dir = join(root, 'src/components/example-card');
    mkdirSync(dir, { recursive: true });
    const tsFile = join(dir, 'example-card.ts');
    writeFileSync(join(dir, 'example-card.html'), '<p>${this.title}</p>');
    const source = `import { html, LitElement } from 'lit';\nexport default class extends LitElement { title = 'hi'; }`;
    const result = injectComponentTrioResult(tsFile, source)!;
    assert.match(result.code, /export default class __LithonoDefaultElement extends/);
    assert.match(result.code, /defineFromFilename\("example-card", __LithonoDefaultElement\)/);
    assert.equal((result.code.match(/import \{ html/g) ?? []).length, 1);
    assert.equal((result.map as { sourcesContent: string[] }).sourcesContent[0], source);
    assert.deepEqual(mappedPosition(result.code, result.map, result.code.indexOf('this.title')), {
      file: join(dir, 'example-card.html'),
      line: 0,
      column: 5,
    });
    assert.deepEqual(mappedPosition(result.code, result.map, result.code.indexOf('title =')), {
      file: tsFile,
      line: 1,
      column: source.split('\n')[1]!.indexOf('title ='),
    });
    parseModule(result.code);
  }));

test('fragment rewriting uses parser spans and preserves escaped literal markers', () => {
  const source = String.raw`<p>\${literal} ${'${title}'}</p>${'${children}'}`;
  assert.equal(
    rewriteFragmentBindings(source, new Map([['title', 'data.title']]), '<b>child</b>'),
    String.raw`<p>\${literal} ${'${data.title}'}</p><b>child</b>`
  );
});

test('sibling TS hydration and inspect manifest explain registration and dependencies', () =>
  fixture((root) => {
    const dir = join(root, 'src/pages/demo');
    mkdirSync(dir, { recursive: true });
    const html = join(dir, 'page.html');
    writeFileSync(html, '<p>${data.title}</p>');
    writeFileSync(
      join(dir, 'page.ts'),
      `// export const hydrate = false\nconst enabled = true as const; export { enabled as hydrate }; export const actions = {};`
    );
    const compiled = compileHtmlModule(html, readFileSync(html, 'utf8'));
    assert.equal(compiled.hydrate, true);
    assert.deepEqual(compiled.hydrationReasons, ['explicit hydrate = true']);
    writeInspectOutput(root);
    const manifest = JSON.parse(readFileSync(join(root, 'dist/inspect/manifest.json'), 'utf8'));
    assert.equal(manifest.templates[0].registration.kind, 'redefineCustomElement');
    assert.ok(manifest.templates[0].dependencies.files.includes(join(dir, 'page.ts')));
    const map = JSON.parse(
      readFileSync(join(root, 'dist/inspect/compiled/src/pages/demo/page.js.map'), 'utf8')
    );
    assert.deepEqual(map.sourcesContent, ['<p>${data.title}</p>']);
    assert.ok(map.mappings.length > 20);
  }));
