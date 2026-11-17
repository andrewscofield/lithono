import { html, LitElement } from 'lit';

class OrdinaryImport extends LitElement {
  static properties = { count: { type: Number } };
  constructor() {
    super();
    this.count = 0;
  }
  render() {
    return html`<button @click=${() => { this.count++; }}>ordinary ${this.count}</button>`;
  }
}
if (!customElements.get('ordinary-import')) customElements.define('ordinary-import', OrdinaryImport);
