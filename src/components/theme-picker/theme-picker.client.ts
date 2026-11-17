class ThemePicker extends HTMLElement {
  connectedCallback() {
    const select = this.querySelector<HTMLSelectElement>('select');
    if (!select) return;
    select.value = document.documentElement.dataset.themePreference ?? 'system';
    select.disabled = false;
    this.addEventListener('change', this.change);
  }
  disconnectedCallback() { this.removeEventListener('change', this.change); }
  private change = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    document.documentElement.dataset.themePreference = value;
    if (value === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
    try { localStorage.setItem('lithono-theme', value); } catch { /* Preference still applies for this document. */ }
  };
}
if (!customElements.get('theme-picker')) customElements.define('theme-picker', ThemePicker);
