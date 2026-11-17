import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const projects = JSON.parse(readFileSync(join(root, 'examples/docs/projects.json'), 'utf8'));

export function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`);
}

/** Generate each checkpoint from a packed starter; overlays never contain framework aliases. */
export function createProject(name, destination, artifacts = join(root, 'artifacts')) {
  const project = projects[name];
  assert(project, `Unknown checkpoint ${name}. Choose: ${Object.keys(projects).join(', ')}`);
  const app = resolve(destination);
  assert(!existsSync(app), `Destination already exists: ${app}`);
  assert(existsSync(dirname(app)), `Create the parent directory first: ${dirname(app)}`);
  const version = JSON.parse(readFileSync(join(root, 'packages/lithono/package.json'), 'utf8')).version;
  const framework = join(resolve(artifacts), `lithono-${version}.tgz`);
  const generator = join(resolve(artifacts), `create-lithono-${version}.tgz`);
  assert(existsSync(framework) && existsSync(generator), 'Build and pack lithono and create-lithono into artifacts/ first; see /docs/installation.');
  run('pnpm', ['dlx', generator, app], dirname(app));
  for (const layer of project.layers) cpSync(join(root, 'examples/docs', layer), app, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  Object.assign(manifest.dependencies, project.dependencies, { lithono: `file:${framework}` });
  const tsconfig = JSON.parse(readFileSync(join(app, 'tsconfig.json'), 'utf8'));
  if (project.dependencies['better-auth']) {
    // Better Auth's database union references bun:sqlite even in Node consumers.
    manifest.devDependencies['bun-types'] = '^1.3.0';
    tsconfig.compilerOptions.types.push('bun-types/sqlite');
  }
  if (existsSync(join(app, 'tests'))) {
    manifest.devDependencies.tsx = '^4.23.0';
    manifest.scripts.test = 'tsx --test tests/*.test.ts';
    tsconfig.include.push('tests/**/*.ts');
  }
  writeFileSync(join(app, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
  writeFileSync(join(app, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(app, 'CHECKPOINT.md'), `# ${name}\n\nGenerated from the packed Lithono starter, with these layers in order:\n\n${project.layers.map(layer => `- examples/docs/${layer}`).join('\n')}\n\nRun pnpm typecheck, pnpm check, pnpm build, and pnpm dev.\nAccount checkpoints require the environment variables in .env.example to be exported\nin your shell; Node production does not automatically load that file.\n\nSee /docs/tutorial-bookstore for the complete walkthrough.\n`);
  run('pnpm', ['install', '--strict-peer-dependencies'], app);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [name, destination] = process.argv.slice(2);
  assert(name && destination, `Usage: node tools/docs-project.mjs <checkpoint> <new-directory>\nCheckpoints: ${Object.keys(projects).join(', ')}`);
  createProject(name, destination);
}
