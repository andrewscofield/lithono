import { LitElement, html } from 'lit';
await new Promise(resolve => setTimeout(resolve, 1200));
class Delayed extends LitElement {
  static properties = { payload: { attribute: false } };
  render() { return html`<output>${this.payload?.value}</output><slot></slot>`; }
}
customElements.define('delayed-element', Delayed);
