import { globSync } from 'node:fs';
import { ELEMENT_GLOBS } from '../element-id.ts';

function listSourceFiles(pattern: string): string[] {
  return globSync(pattern, { cwd: process.cwd() })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .sort();
}

export async function loadPageModules(): Promise<Record<string, { default?: unknown }>> {
  const modules: Record<string, { default?: unknown }> = {};
  for (const file of listSourceFiles('src/pages/**/*.ts')) {
    modules[`/${file}`] = (await import(`/${file}`)) as { default?: unknown };
  }
  return modules;
}

export function loadElementModules(): Record<string, () => Promise<unknown>> {
  const modules: Record<string, () => Promise<unknown>> = {};
  for (const pattern of ELEMENT_GLOBS) {
    for (const file of listSourceFiles(pattern)) {
      modules[`/${file}`] = () => import(`/${file}`);
    }
  }
  return modules;
}
