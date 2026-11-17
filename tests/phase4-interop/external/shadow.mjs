import { LitElement, html } from 'lit';
class Shadow extends LitElement {
  static properties = { count: { type: Number } };
  constructor() { super(); this.count = 0; }
  render() { return html`<button @click=${() => this.count++}>shadow ${this.count}</button>`; }
}
if (!customElements.get('external-shadow')) customElements.define('external-shadow', Shadow);
