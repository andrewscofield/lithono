/** Enhance server-owned markup; copying never re-renders the code or its whitespace. */
class DocsCode extends HTMLElement {
  private timer?: ReturnType<typeof setTimeout>;
  connectedCallback() {
    this.querySelector<HTMLButtonElement>('[data-copy]')?.removeAttribute('disabled');
    this.addEventListener('click', this.copy);
  }
  disconnectedCallback() {
    this.removeEventListener('click', this.copy);
    clearTimeout(this.timer);
  }
  private copy = async (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-copy]');
    if (!button || !this.contains(button)) return;
    const source = this.querySelector('pre code')?.textContent;
    const status = this.querySelector<HTMLElement>('[role="status"]');
    if (source === undefined || source === null || !status) return;
    try {
      await navigator.clipboard.writeText(source);
      status.textContent = 'Code copied to clipboard';
      button.textContent = 'Copied';
    } catch {
      status.textContent = 'Copy unavailable. Select the code and copy it manually.';
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { button.textContent = 'Copy'; status.textContent = ''; }, 2500);
  };
}
if (!customElements.get('docs-code')) customElements.define('docs-code', DocsCode);
