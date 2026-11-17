#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeEditorMetadata } from '../src/framework/editor/manifest.ts';
import { loadLithonoConfig } from '../src/framework/config.ts';
import { compileHtmlModule, isTrioHtml } from '../src/framework/compiler/html.ts';
import { listPageHtml } from '../src/framework/compiler/files.ts';
import { globSync } from 'node:fs';
import { parseJavaScript, parseModule } from '../src/framework/compiler/parser.ts';
import { injectComponentTrioResult } from '../src/framework/compiler/inject.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];

if (command === 'check') {
  const root = process.cwd();
  const htmlFiles = [
    ...listPageHtml(root),
    ...globSync('src/components/**/*.html', { cwd: root }).map((file) =>
      file.replaceAll('\\', '/')
    ),
  ];
  let failed = 0;
  for (const rel of htmlFiles) {
    const file = path.join(root, rel);
    if (
      !isTrioHtml(file) &&
      !rel.includes('/src/components/') &&
      !rel.startsWith('src/components/')
    )
      continue;
    try {
      const source = fs.readFileSync(file, 'utf8');
      const compiled = compileHtmlModule(file, source);
      parseJavaScript(compiled.code, `${file}.generated.js`);
      console.log(`ok  ${rel}`);
    } catch (error) {
      failed += 1;
      console.error(`err ${rel}`);
      console.error(error instanceof Error ? error.message : error);
    }
  }
  const tsFiles = globSync('src/{pages,components}/**/*.ts', { cwd: root }).filter(
    (file) => !file.endsWith('.d.ts')
  );
  for (const rel of tsFiles) {
    const file = path.join(root, rel);
    try {
      const source = fs.readFileSync(file, 'utf8');
      parseModule(source, file);
      if (rel.startsWith('src/components/')) injectComponentTrioResult(file, source);
      console.log(`ok  ${rel}`);
    } catch (error) {
      failed += 1;
      console.error(`err ${rel}\n${error instanceof Error ? error.message : error}`);
    }
  }
  if (failed) {
    console.error(`lithono check failed: ${failed} file(s)`);
    process.exit(1);
  }
  console.log(
    `lithono check passed (${htmlFiles.length} templates, ${tsFiles.length} TypeScript modules)`
  );
  process.exit(0);
}

if (command !== 'generate' || !args[1]) {
  console.error('Usage: pnpm cli generate <component-name>\n       pnpm cli check');
  process.exit(1);
}

const componentName = args[1];
const config = await loadLithonoConfig(process.cwd());
const prefix = config.prefix ? `${config.prefix}-` : '';

let tag = componentName;
if (prefix && !tag.startsWith(prefix)) {
  tag = `${prefix}${tag}`;
}

if (!tag.includes('-')) {
  console.error(
    'Component name must be a hyphenated custom element tag, e.g. listing-card or configured with a prefix'
  );
  process.exit(1);
}

const className = tag
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join('');

function writeFromTemplate(templateFile: string, dest: string) {
  const templatePath = path.join(__dirname, 'templates', templateFile);
  let template = fs.readFileSync(templatePath, 'utf8');
  template = template.replaceAll('__TAG_NAME__', tag);
  template = template.replaceAll('__CLASS_NAME__', className);
  fs.writeFileSync(dest, template);
}

const outDir = path.resolve(process.cwd(), 'src/components', tag);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

writeFromTemplate('component.ts', path.join(outDir, `${tag}.ts`));
writeFromTemplate('component.html', path.join(outDir, `${tag}.html`));
writeFromTemplate('component.css', path.join(outDir, `${tag}.css`));
writeEditorMetadata(process.cwd());

console.log(`Generated <${tag}> at src/components/${tag}/`);
