import { LithonoElement, html } from 'lithono/client';
import './production-counter.css';
export default class ProductionCounter extends LithonoElement {
  static root = 'light' as const;
  count = 0;
  render() {
    return html`<button @click=${() => { this.count++; this.requestUpdate(); }}>Count: ${this.count}</button>`;
  }
}
