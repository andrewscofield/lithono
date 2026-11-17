import '@/components/docs-code/docs-code.client.ts';

class DocsShell extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', this.toggle);
    document.addEventListener('lithono:navigation', this.navigation);
    this.updateCurrent();
  }
  disconnectedCallback() {
    this.removeEventListener('click', this.toggle);
    document.removeEventListener('lithono:navigation', this.navigation);
  }
  private updateCurrent = () => {
    for (const link of this.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Documentation"] a')) {
      link.setAttribute('aria-current', new URL(link.href).pathname === location.pathname ? 'page' : 'false');
    }
  };
  private navigation = () => {
    this.updateCurrent();
    this.removeAttribute('data-menu-open');
    this.querySelector('[data-docs-toggle]')?.setAttribute('aria-expanded', 'false');
  };
  private toggle = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-docs-toggle]');
    if (!button) return;
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    this.toggleAttribute('data-menu-open', expanded);
  };
}
if (!customElements.get('docs-shell')) customElements.define('docs-shell', DocsShell);
