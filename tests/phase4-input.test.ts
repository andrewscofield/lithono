import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { dispatchAction, readActionRequest } from '../src/framework/server/actions.ts';
import { actionEnvelopeResult } from '../src/framework/action-protocol.ts';

function app() {
  const app = new Hono();
  app.all('/page', async (c) => {
    const request = await readActionRequest(c);
    const result = await dispatchAction({ c, actionName: request.name ?? '', request, params: {}, locals: {},
      actions: { save: { method: c.req.method === 'GET' ? 'GET' : 'POST', run: ({ input }) => input } },
    });
    return result.type === 'response' ? result.response : c.json(result.failure, 400);
  });
  return app;
}

test('GET and urlencoded inputs preserve exact names, repeated ordered values, empty values, and safe property names', async () => {
  const fields = '_action=save&tag=a&tag=b&single=one&empty=&literal%5B%5D=a&literal%5B%5D=b&__proto__=safe&constructor=value';
  for (const method of ['GET', 'POST']) {
    const response = await app().request(`/page${method === 'GET' ? `?${fields}` : ''}`, {
      method, headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(method === 'POST' ? { body: fields } : {}),
    });
    assert.equal(response.status, 200);
    const input = actionEnvelopeResult(await response.json());
    assert.deepEqual(input, JSON.parse('{"tag":["a","b"],"single":"one","empty":"","literal[]":["a","b"],"__proto__":"safe","constructor":"value"}'));
  }
});

test('multipart parsing retains repeated File objects, with and without prefetched body discriminator', async () => {
  for (const discriminator of ['query', 'body']) {
    const body = new FormData();
    if (discriminator === 'body') body.append('_action', 'save');
    body.append('tag', 'a'); body.append('tag', 'b');
    body.append('upload', new File(['first'], 'first.txt'));
    body.append('upload', new File(['second'], 'second.txt'));
    const app = new Hono();
    app.post('/page', async (c) => {
      const request = await readActionRequest(c);
      const result = await dispatchAction({ c, actionName: request.name!, request, params: {}, locals: {},
        actions: { save: { method: 'POST', run: async ({ input }) => {
          const values = input as { tag: string[]; upload: File[]; _action?: string };
          assert.deepEqual(values.tag, ['a', 'b']);
          assert.equal(values._action, undefined);
          assert.deepEqual(await Promise.all(values.upload.map(async (file) => [file.name, await file.text()])), [['first.txt', 'first'], ['second.txt', 'second']]);
          return true;
        } } },
      });
      return result.type === 'response' ? result.response : c.json(result.failure, 400);
    });
    const response = await app.request(`/page${discriminator === 'query' ? '?_action=save' : ''}`, { method: 'POST', body, headers: { Accept: 'application/json' } });
    assert.equal(response.status, 200);
    assert.equal(actionEnvelopeResult(await response.json()), true);
  }
});
