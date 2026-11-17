import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { getProviderConfig } from '../../src/server/integrations/config.ts';

// Set before importing the production helper (which uses the shared singleton).
process.env.LITHONO_DEMO_DATABASE = ':memory:';
process.env.LITHONO_EDITOR_EMAILS = 'editor@example.test';
process.env.LITHONO_EDITOR_USER_IDS = 'provisioned-editor';
const { requireWorkspace, requireEditor, isEditor } = await import('../../src/server/workspace.ts');
const { sqlite } = await import('../../src/server/db.ts');

test('shared helpers require auth-derived workspace and explicit editorial allowlist', async () => {
  const app = new Hono();
  app.get('/:role', c => {
    const role = c.req.param('role');
    const user = role === 'anonymous' ? null : {
      id: role, name: role, email: role === 'unverified-editor' ? 'editor@example.test' : `${role}@example.test`,
      emailVerified: role === 'editor',
    };
    const ctx = { c, user, url: new URL(c.req.url) };
    try {
      if (c.req.query('edit')) return c.json({ editor: requireEditor(ctx).id });
      return c.json(requireWorkspace(ctx));
    } catch (error) {
      return c.json({ error: String(error) }, (error as { status?: number }).status === 403 ? 403 : 401);
    }
  });
  assert.equal((await app.request('/anonymous', { headers: { Accept: 'application/json' } })).status, 401);
  assert.deepEqual(await (await app.request('/alice?workspace=bob')).json(), { id: 'alice', ownerId: 'alice' });
  assert.deepEqual(await (await app.request('/bob')).json(), { id: 'bob', ownerId: 'bob' });
  assert.equal((await app.request('/alice?edit=1')).status, 403);
  assert.equal((await app.request('/editor?edit=1')).status, 200);
  assert.equal((await app.request('/unverified-editor?edit=1')).status, 403);
  assert.equal((await app.request('/provisioned-editor?edit=1')).status, 200);
  assert.equal(isEditor({ id: 'editor', email: ' EDITOR@EXAMPLE.TEST ', emailVerified: true }), true);
  assert.equal(isEditor({ id: 'editor', email: 'editor@example.test', emailVerified: true }, getProviderConfig({})), false);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM showcase_workspaces').get()?.n, 2);
  sqlite.close();
});
