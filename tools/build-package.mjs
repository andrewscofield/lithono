import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, chmodSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const dest = new URL('../packages/lithono/dist/', import.meta.url);
rmSync(dest, { recursive: true, force: true });
const result = spawnSync('pnpm', ['exec', 'tsc', '-p', 'packages/lithono/tsconfig.build.json'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync(new URL('cli/templates/', dest), { recursive: true });
cpSync(new URL('../cli/templates/', import.meta.url), new URL('cli/templates/', dest), { recursive: true });
cpSync(new URL('../content/docs/', import.meta.url), new URL('docs/', dest), { recursive: true });
cpSync(new URL('../reference/engineering/', import.meta.url), new URL('reference/engineering/', dest), { recursive: true });
chmodSync(new URL('cli/index.js', dest), 0o755);
for (const file of globSync('src/framework/**/*.css', { cwd: root })) {
  cpSync(new URL(`../${file}`, import.meta.url), new URL(file, dest));
}
