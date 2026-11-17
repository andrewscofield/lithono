import { LitElement, html } from 'lit';
import { state } from 'lit/decorators.js';

class DashboardCounter extends LitElement {
  @state() private count = 0;
  override render() { return html`<button @click=${() => this.count++}>Delayed counter: ${this.count}</button>`; }
}
if (!customElements.get('dashboard-counter')) customElements.define('dashboard-counter', DashboardCounter);
