import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentQuery } from '../../src/lib/component-query.ts';

test('component query shares strict filter normalization for direct GET URLs', () => {
  assert.deepEqual(componentQuery('/components?q=%20counter%20&category=Interaction&rendering=shadow&ssr=unknown'), {
    q: 'counter', category: 'Interaction', rendering: 'shadow', ssr: 'unknown',
  });
  assert.deepEqual(componentQuery('/components?category=Nope&rendering=other&ssr=yes'), { q: '', category: '', rendering: '', ssr: '' });
  assert.equal(componentQuery('/components?q=' + 'x'.repeat(200)).q.length, 100);
});
