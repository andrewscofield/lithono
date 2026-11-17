const previews = {
  'light-counter': async () => { await import('../directory-counter/directory-counter.ts'); return document.createElement('directory-counter'); },
  'vanilla-counter': async () => { await import('../../previews/vanilla.ts'); return document.createElement('directory-vanilla'); },
  'shadow-counter': async () => { await import('../../previews/shadow.ts'); return document.createElement('directory-shadow'); },
  'wa-button': async () => { await import('@awesome.me/webawesome/dist/styles/webawesome.css'); await import('@awesome.me/webawesome/dist/components/button/button.js'); const element = document.createElement('wa-button'); element.textContent = 'Web Awesome clicks: 0'; let count = 0; element.addEventListener('click', () => { element.textContent = `Web Awesome clicks: ${++count}`; }); return element; },
  'wa-switch': async () => {
    await import('@awesome.me/webawesome/dist/styles/webawesome.css');
    await import('@awesome.me/webawesome/dist/components/switch/switch.js');
    const container = document.createElement('div');
    container.className = 'stack';
    const element = document.createElement('wa-switch');
    element.textContent = 'Enable notifications';
    const status = document.createElement('output');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Notifications are off';
    element.addEventListener('change', () => { status.textContent = element.checked ? 'Notifications are on' : 'Notifications are off'; });
    container.append(element, status);
    return container;
  },
  ...Object.fromEntries(['native-details', 'native-form', 'native-progress', 'native-meter', 'native-dialog', 'native-output', 'native-validation'].map(name => [name, async () => (await import('../../previews/native.ts')).createNative(name)])),
} satisfies Record<string, () => Promise<HTMLElement>>;

class PreviewHost extends HTMLElement {
  private generation = 0;
  connectedCallback() {
    this.addEventListener('click', this.activate);
    const button = this.querySelector<HTMLButtonElement>('[data-activate]')!;
    button.disabled = false;
    if (!this.hasAttribute('manual') && !this.querySelector('[data-preview]')!.childElementCount) void this.load(button);
  }
  disconnectedCallback() { ++this.generation; this.removeEventListener('click', this.activate); }
  private activate = async (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-activate]');
    if (!button || !this.contains(button)) return;
    await this.load(button);
  };
  private load = async (button: HTMLButtonElement) => {
    const output = this.querySelector<HTMLElement>('[data-preview]')!;
    const status = this.querySelector<HTMLElement>('[role="status"]')!;
    const name = this.dataset.example ?? '';
    const load = Object.hasOwn(previews, name) ? previews[name as keyof typeof previews] : undefined;
    const generation = ++this.generation;
    button.disabled = true;
    status.textContent = 'Loading selected preview…';
    try {
      if (!load) throw new Error('Unknown preview');
      const element = await load();
      if (!this.isConnected || generation !== this.generation) return;
      output.replaceChildren(element);
      // Lit render failures reject updateComplete and stay local to this host.
      if ('updateComplete' in element) await element.updateComplete;
      status.textContent = 'Preview ready. Browser-only example; no server rendering implied.';
      button.hidden = true;
    } catch (error) {
      if (!this.isConnected || generation !== this.generation) return;
      output.replaceChildren();
      status.textContent = 'Preview failed to load. Retry or use the source and catalogue links below.';
      console.error('Directory preview failed:', name, error);
      button.disabled = false;
      button.hidden = false;
      button.textContent = 'Retry preview';
    }
  };
}
customElements.define('preview-host', PreviewHost);
