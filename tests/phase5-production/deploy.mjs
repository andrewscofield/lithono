import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const example = process.argv.includes('--example');
const fixture = fileURLToPath(new URL(example ? '../../' : './', import.meta.url));
execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: fixture, stdio: 'inherit' });
const deployment = mkdtempSync(join(tmpdir(), 'lithono-phase5-'));
cpSync(resolve(fixture, 'dist'), resolve(deployment, 'dist'), { recursive: true });
const rootPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const names = ['@hono/node-server', 'hono', 'lit', '@lit/context', '@lit-labs/ssr', '@lit-labs/ssr-client', 'zod', ...(example ? ['animejs', 'better-auth', 'maplibre-gl', 'shiki'] : [])];
const declared = { ...rootPackage.devDependencies, ...rootPackage.dependencies };
writeFileSync(resolve(deployment, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: Object.fromEntries(names.map((name) => {
  if (!declared[name]) throw new Error(`Missing deployment dependency: ${name}`);
  return [name, declared[name]];
})) }, null, 2));
execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: deployment, stdio: 'inherit' });
if (existsSync(resolve(deployment, 'src'))) throw new Error('Deployment must not contain source');
if (existsSync(resolve(deployment, 'content'))) throw new Error('Deployment must not contain authoring Markdown');
// Remove build metadata: requests must use the embedded manifest, never a disk fallback.
execFileSync(process.execPath, ['-e', "require('node:fs').rmSync('dist/client/.vite', {recursive:true})"], { cwd: deployment });
const installed = JSON.parse(execFileSync('npm', ['ls', '--depth=0', '--json'], { cwd: deployment, encoding: 'utf8' }));
console.error('PHASE5_DEPLOYMENT=' + JSON.stringify({ example, directory: deployment, sourceDirectory: false, node: process.version, dependencies: Object.fromEntries(Object.entries(installed.dependencies).map(([name, dependency]) => [name, dependency.version])) }));
const server = spawn(process.execPath, ['dist/server/src/server.js'], { cwd: deployment, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production', PORT: example ? '4186' : '4185' } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
