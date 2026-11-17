import { html } from 'lit';
import { property, state, customElement } from 'lit/decorators.js';
import { LithonoElement, createUrlState, revalidateUrlState } from 'lithono/client';
import { labQuery } from '@/lib/lab-query.ts';
import '@/components/lab-controls/lab-controls.css';
@customElement('lab-controls')
export class LabControls extends LithonoElement {
  static root = 'light' as const;
  static hydrate = true;
  @property() sample = 'first';
  @state() private count = 0;
  @state() private optional = 'idle';
  @state() private mapped = false;
  @state() private moduleLinks: string[] = [];
  override firstUpdated() {
    if (typeof document !== 'undefined') this.moduleLinks = [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map(s => s.src);
  }
  private generation = 0;
  private createState() { return createUrlState(labQuery, { revalidate: revalidateUrlState }); }
  private url?: ReturnType<LabControls['createState']>;
  private unsubscribe?: () => void;
  override connectedCallback() {
    super.connectedCallback(); if (typeof window === 'undefined') return;
    this.url = this.createState(); this.unsubscribe = this.url.subscribe(() => this.requestUpdate()); this.url.start();
  }
  override disconnectedCallback() { this.generation++; this.url?.dispose(); this.unsubscribe?.(); super.disconnectedCallback(); }
  private async load(fail: boolean) {
    this.optional = 'loading'; const generation = ++this.generation;
    try {
      await new Promise(resolve => setTimeout(resolve, 900));
      if (!this.isConnected || generation !== this.generation) return;
        if (fail) await import('@/lab/failure.ts');
        else await import('@/previews/shadow.ts');
      if (this.isConnected && generation === this.generation) this.optional = 'ready';
    } catch { if (this.isConnected && generation === this.generation) this.optional = 'failed: deliberate module initialization error; native form and counter remain available'; }
  }
  override render() {
    const sample = this.url?.current.values.sample ?? this.sample;
    return html`<section class="card stack"><h2>One URL owner, two consumers</h2>
      <form method="get" action="/lab" @submit=${(e: Event) => {
        e.preventDefault(); const form = e.target as HTMLFormElement;
        void this.url?.patch(labQuery.read(new URLSearchParams(new FormData(form) as never)), { history: 'push', effect: 'revalidate' }).catch(() => { this.optional = 'URL refresh failed; retry or use native navigation'; });
      }}><label>Lab sample <select name="sample"><option value="first" ?selected=${sample === 'first'}>First</option><option value="second" ?selected=${sample === 'second'}>Second</option></select></label><button type="submit">Change sample</button></form>
      <p data-consumer="one">URL consumer one: ${sample}</p><p data-consumer="two">URL consumer two: ${sample}</p>
      <label>Local identity draft <input name="draft" placeholder="Retained across URL refresh"></label>
      <button type="button" @click=${() => { this.count++; }}>Light counter: ${this.count}</button>
      <button type="button" @click=${() => this.load(false)}>Load slow shadow preview</button><button type="button" @click=${() => this.load(true)}>Load failing module</button>
      <p role="status">Optional experiment: ${this.optional}</p>
      ${this.optional === 'ready' ? html`<directory-shadow></directory-shadow>` : html`<p>Optional shadow preview fallback remains until selected module is ready.</p>`}
      <button type="button" @click=${() => { this.mapped = true; }}>Activate mapped Web Awesome</button>
      ${this.mapped ? html`<wa-switch>Mapped lab switch</wa-switch>` : ''}
      <details><summary>Actual loaded client output links</summary><p>Browser DOM module script URLs, including Vite development or hashed production output. Open a link to inspect the actual served module.</p>${this.moduleLinks.map(src => html`<p><a href=${src}>${new URL(src).pathname}</a></p>`)}</details>
    </section>`;
  }
}
export default LabControls;
