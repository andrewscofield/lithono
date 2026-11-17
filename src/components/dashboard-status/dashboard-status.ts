/** Ordinary registration: this element observes native forms, never owns their DOM. */
if (typeof HTMLElement !== 'undefined') {
class DashboardStatus extends HTMLElement {
  private formHost?: HTMLElement;
  private success = (event: Event) => {
    if ((event as CustomEvent).detail?.action !== 'changeStatus') return;
    this.dataset.enhancedSaves = String(Number(this.dataset.enhancedSaves ?? 0) + 1);
    const output = this.querySelector('[data-status-feedback]');
    if (output) output.textContent = `Status saved (${this.dataset.enhancedSaves}). Server activity refreshed.`;
  };
  connectedCallback() {
    this.formHost = this.closest<HTMLElement>('[data-lithono-page]') ?? undefined;
    this.formHost?.addEventListener('lithono:success', this.success);
  }
  disconnectedCallback() {
    this.formHost?.removeEventListener('lithono:success', this.success);
    this.formHost = undefined;
  }
}
if (!customElements.get('dashboard-status')) customElements.define('dashboard-status', DashboardStatus);
}
