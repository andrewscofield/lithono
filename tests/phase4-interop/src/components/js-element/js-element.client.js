class Vanilla extends HTMLElement {
  connectedCallback() { this.setAttribute('data-upgraded', 'js'); }
}
if (!customElements.get('js-element')) customElements.define('js-element', Vanilla);
