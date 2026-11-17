import { root, run } from './docs-project.mjs';

// Package gates replace workspace output; keep them before app/config checks.
for (const command of ['test:docs', 'test:docs:checkpoints', 'test:types', 'check', 'lint', 'build']) run('pnpm', [command], root);
const cases = ['tests/demo-apps/documentation.spec.ts', 'tests/demo-apps/bookstore.spec.ts', 'tests/demo-apps/lab.spec.ts'];
for (const command of ['test:demos', 'test:demos:production']) run('pnpm', [command, ...cases], root);
run('node', ['tools/docs-site-check.mjs'], root);
console.log('Documentation completion gate passed.');
