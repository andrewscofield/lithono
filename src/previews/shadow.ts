import { LitElement, html, css } from 'lit';
import { state } from 'lit/decorators.js';

class DirectoryShadow extends LitElement {
  static styles = css`
    :host { display: block; }
    button { font: 600 0.95rem/1.4 system-ui, sans-serif; cursor: pointer; padding: 0.8rem 1.25rem; border: 1px solid var(--color-brand, #0f6e56); border-radius: 10px; background: var(--color-brand, #0f6e56); color: var(--color-brand-ink, white); box-shadow: 0 3px 10px #0001; }
    button:hover { filter: brightness(1.1); }
    button:focus-visible { outline: 3px solid var(--color-focus, #0f6e56); outline-offset: 4px; }
  `;
  @state() private count = 0;
  render() {
    return html`<button type="button" @click=${() => this.count++}>Shadow count: ${this.count}</button>`;
  }
}
if (!customElements.get('directory-shadow')) customElements.define('directory-shadow', DirectoryShadow);
