import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html } from 'lit';
import { parseFragment } from 'parse5';
import { compileHtml } from '../src/framework/compiler/html.ts';
import { renderPageTemplate } from '../src/framework/server/render.ts';

test('compiled textarea content uses property parts instead of unsupported raw-text child parts', () => {
  const output = compileHtml('<textarea name="note">Hello &amp; ${note}!</textarea><p>${after}</p>', {
    file: '/fixture/src/pages/textarea/page.html', kind: 'page', hydrateOverride: true,
  });
  assert.match(output.code, /data-lithono-textarea=/);
  assert.match(output.code, /\.value=/);
  assert.match(output.code, /Hello & /);
  assert.doesNotMatch(output.code, />Hello \$\{note\}!<\/textarea>/);
});

test('SSR textarea native default text preserves escaped content and leading newline without script injection', async () => {
  const text = '\n</textarea><script>bad()</script> & "hello"';
  const result = await renderPageTemplate(html`<textarea data-lithono-textarea=${text} .value=${text}></textarea><p>${'after'}</p>`);
  const markup = result.chunks.join('');
  assert.ok(!markup.includes('<script>bad()</script>'));
  const fragment = parseFragment(markup);
  const textarea = fragment.childNodes.find(node => node.nodeName === 'textarea') as { childNodes: { value?: string }[] };
  assert.equal(textarea.childNodes[0].value, text);
  assert.match(markup, /after/);
});
