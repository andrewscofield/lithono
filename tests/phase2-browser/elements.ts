import { html, noChange } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { LithonoElement } from '../../src/framework/client/lithono.ts';
import { LithonoPage } from '../../src/framework/client/page.ts';
import { LithonoLayout } from '../../src/framework/client/layout.ts';
import { renderLight } from '../../src/framework/client/render-light.ts';
import { PageDataController, ParamsController, SessionController, ActionsController, UrlController } from '../../src/framework/client/controllers.ts';
import { defineQuery, query } from '../../src/framework/url.ts';
import { provide } from '@lit/context';
import { pageDataContext, sessionContext } from '../../src/framework/client/context.ts';

export class Counter extends LithonoElement {
  @property({ type: Number }) count = 0;
  override render() {
    return html`<button @click=${() => this.count++}>count ${this.count}</button><input class="component-draft">`;
  }
}
// Exercise standard Lit light-root overrides as well as the framework default.
export class LightRootCounter extends Counter {
  protected override createRenderRoot() { return this; }
}
export class ShadowCounter extends Counter { static override root = 'shadow' as const; }
export class Consumer extends LithonoElement {
  page = new PageDataController<{ revision: number } | null>(this);
  session = new SessionController(this);
  params = new ParamsController(this);
  actionState = new ActionsController(this);
  override render() { return html`<output>${JSON.stringify({ data: this.page.value, session: this.session.value })}</output>`; }
}
export class NullProvider extends LithonoElement {
  @provide({ context: pageDataContext }) @property({ attribute: false }) data = null;
  @provide({ context: sessionContext }) @property({ attribute: false }) session = null;
  override render() { return html`<phase2-consumer>${renderLight()}</phase2-consumer>`; }
}
export class Page extends LithonoPage {
  static override tagName = 'phase2-page';
  static override hydrate = true;
  query = new UrlController(this, defineQuery({ filter: query.string() }));
  override render() {
    const data = this.data as { revision: number; items: string[] };
    return html`<h1>revision ${data.revision}</h1><input id="draft"><p id="url">${this.pageUrl.href}</p><p id="query">${this.query.value.filter}</p>
      <p id="params">${JSON.stringify(this.params)}</p><p id="failure">${JSON.stringify(this.failure)}</p>
      <p id="empty-message">${data.revision ? `Ready ${data.revision}` : ''}</p>
      <form method="POST" action=${this.actionMap.invalid.url} data-lithono-native><input name="name" value=${String(this.actionMap.invalid.values?.name ?? '')}><button>Invalid</button></form>
      <phase2-counter>${renderLight()}</phase2-counter><phase2-shadow>${renderLight()}</phase2-shadow>
      <phase2-consumer id="page-consumer">${renderLight()}</phase2-consumer>
      <phase2-null>${renderLight()}</phase2-null>
      <ul>${repeat(data.items, (key) => key, (key) => html`<li data-key=${key}><phase2-counter>${renderLight()}</phase2-counter>${key}</li>`)}</ul>`;
  }
}
export class Layout extends LithonoLayout {
  static override tagName = 'phase2-layout';
  static override hydrate = true;
  override render() {
    const data = this.data as { label: string; revision: number };
    return html`<section><header>${data.label} revision ${data.revision}</header><input class="layout-draft">
      <div class="outlet">${this.pageChildren ?? noChange}</div><footer>${this.pageUrl.search}</footer></section>`;
  }
}
for (const [tag, ctor] of [
  ['phase2-counter', LightRootCounter], ['phase2-shadow', ShadowCounter], ['phase2-consumer', Consumer],
  ['phase2-null', NullProvider], ['phase2-page', Page], ['phase2-layout', Layout],
] as const) {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}
