import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addManifestAliases } from '../src/framework/compiler/manifest-aliases.ts';

test('coalesced dynamic elements resolve to actual shared chunk and retain CSS/static dependencies only', () => {
  const shared = { file: 'assets/shared.js', imports: ['_lit.js'], css: ['assets/filters.css'] };
  const manifest: Record<string, typeof shared | { file: string; src: string }> = {
    '_shared.js': shared,
    'src/kept.ts': { file: 'assets/kept.js', src: 'src/kept.ts' },
  };
  addManifestAliases(manifest, [{ fileName: 'assets/shared.js', modules: {
    '/app/src/components/filters.ts': {}, '/app/src/kept.ts': {}, '/app/node_modules/sdk.js': {},
  } }], new Map([
    ['/app/src/components/filters.ts', 'src/components/filters.ts'], ['/app/src/kept.ts', 'src/kept.ts'],
  ]));
  assert.deepEqual(manifest['src/components/filters.ts'], { ...shared, src: 'src/components/filters.ts' });
  assert.equal(manifest['src/kept.ts'].file, 'assets/kept.js');
  assert.equal(manifest['/app/node_modules/sdk.js'], undefined);
});
