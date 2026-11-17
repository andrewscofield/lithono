class VanillaModule extends HTMLElement {
  connectedCallback() { this.setAttribute('data-upgraded', 'mjs'); }
}
if (!customElements.get('mjs-element')) customElements.define('mjs-element', VanillaModule);
