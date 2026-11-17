import { LithonoElement, html } from 'lithono/client';
import { property } from 'lit/decorators.js';
import { counterLabel } from '@/lib/starter.ts';
export default class StarterCounter extends LithonoElement {
  @property({ type: Number }) count = 0;
  override render() {
    return html`<button @click=${() => this.count++}>${counterLabel(this.count)}</button>`;
  }
}
