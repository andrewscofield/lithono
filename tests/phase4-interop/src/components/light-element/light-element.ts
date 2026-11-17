import { html, LithonoElement } from 'lithono/client';
export class Light extends LithonoElement {
  static properties = { count: { type: Number } };
  count = 0;
  render() { return html`<button @click=${() => { this.count++; }}>light ${this.count}</button><output>${this.pageData<{ label: string }>().label}</output>`; }
}
if (!customElements.get('light-element')) customElements.define('light-element', Light);
