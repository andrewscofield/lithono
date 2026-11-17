import { html } from 'lit';
import { property, state, customElement } from 'lit/decorators.js';
import { LithonoElement, createUrlState, revalidateUrlState, webmcpTool } from 'lithono/client';
import { dashboardQuery } from '../../lib/dashboard-query.ts';
import type { DashboardData } from '../../pages/dashboard/page.ts';
import '../dashboard-status/dashboard-status.ts';
import '../dashboard-chart/dashboard-chart.ts';
import './dashboard-view.css';

@customElement('dashboard-view')
export class DashboardView extends LithonoElement {
  static root = 'light' as const;
  static hydrate = true;
  @property({ attribute: false }) data?: DashboardData;
  @state() private error = '';
  @state() private menu = false;
  @state() private delay: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  private url?: ReturnType<typeof this.createState>;
  private createState() { return createUrlState(dashboardQuery, { revalidate: revalidateUrlState,
    mcp: { name: 'filter_dashboard', description: 'Filter analytics dashboard metrics by project and day range' },
    onError: () => { this.error = 'Dashboard refresh failed. Retry or use a native project link.'; } }); }
  private unsubscribe?: () => void;
  private generation = 0;
  private connectedBefore = false;
  private submit = (event: Event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.method !== 'get') return;
    event.preventDefault();
    void this.url?.patch(dashboardQuery.read(new URLSearchParams(new FormData(form) as never)),
      { history: 'push', effect: 'revalidate' }).catch(() => { this.error = 'Dashboard refresh failed. Retry or use a native project link.'; });
  };
  override connectedCallback() {
    super.connectedCallback();
    if (typeof window === 'undefined') return;
    this.url = this.createState();
    this.unsubscribe = this.url.subscribe(() => this.requestUpdate());
    this.url.start();
    if (this.connectedBefore) void this.url.refresh().catch(() => { this.error = 'Refresh after reconnect failed. Use a native project link.'; });
    this.connectedBefore = true;
    this.addEventListener('submit', this.submit);
  }
  override disconnectedCallback() {
    this.generation++;
    if (this.delay === 'loading') this.delay = 'idle';
    this.removeEventListener('submit', this.submit);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.url?.dispose();
    this.url = undefined;
    super.disconnectedCallback();
  }
  @webmcpTool({
    name: 'get_dashboard_summary',
    description: 'Inspect current dashboard query filters, menu state, and optional counter widget status',
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  getSummary() {
    return {
      query: this.url?.current.values ?? this.data?.query ?? null,
      menuOpen: this.menu,
      counterState: this.delay,
      error: this.error || null,
    };
  }
  private async loadCounter() {
    this.delay = 'loading';
    const generation = this.generation;
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (!this.isConnected || generation !== this.generation) return;
      await import('../dashboard-counter/dashboard-counter.ts');
      if (this.isConnected && generation === this.generation) this.delay = 'ready';
    } catch { if (generation === this.generation) this.delay = 'error'; }
  }
  private toggleMenu() { this.menu = !this.menu; }
  private unrelatedMarkup() {
    const href = this.url?.current.href ?? this.data?.href;
    return href ? [...new URL(href).searchParams].filter(([key]) => !['project', 'range', '_action'].includes(key))
      .map(([key, value]) => html`<input type="hidden" name=${key} value=${value}>`) : '';
  }
  private delayMarkup() {
    return html`<button type="button" ?disabled=${this.delay === 'loading'} @click=${() => this.loadCounter()}>Load delayed widget</button>
      <span role="status">${this.delay === 'loading' ? 'Loading optional counter…' : this.delay === 'error' ? 'Counter unavailable. Retry.' : ''}</span>
      ${this.delay === 'ready' ? html`<dashboard-counter></dashboard-counter>` : ''}`;
  }
  private menuMarkup() {
    return html`<button type="button" aria-expanded=${this.menu} @click=${() => this.toggleMenu()}>Chart controls</button>
      ${this.menu ? html`<wa-switch checked @change=${(event: Event) => {
        const chart = this.querySelector<HTMLElement>('dashboard-chart');
        if (chart) chart.hidden = !(event.target as HTMLElement & { checked: boolean }).checked;
      }}>Show enhanced chart</wa-switch>` : ''}`;
  }
}
export default DashboardView;
