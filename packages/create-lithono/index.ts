#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dest = process.argv[2] ?? 'lithono-app';
const here = dirname(fileURLToPath(import.meta.url));
const template = join(here, '../template');
if (existsSync(dest)) {
  console.error(`create-lithono: ${dest} already exists`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(template, dest, { recursive: true });
console.log(`Created ${dest}. Next:
  cd ${dest}
  pnpm install
  pnpm dev
`);
