import { html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LithonoElement, createUrlState, revalidateUrlState, renderLight } from 'lithono/client';
import { propertyQuery, propertyHref } from '../../lib/property-query.ts';
import type { PropertyQuery } from '../../lib/property-query.ts';
import type { Property } from '../../server/repositories/properties.ts';
import '../property-map/property-map.ts';
import './property-filters.css';

export interface ExplorerData {
  query: PropertyQuery;
  listings: Property[];
  map: { styleUrl?: string; attribution?: string };
  href: string;
  pages: number;
}

@customElement('property-filters')
export class PropertyFilters extends LithonoElement {
  static root = 'light' as const;
  static hydrate = true;
  @property({ attribute: false }) data?: ExplorerData;
  @state() private view: 'list' | 'map' | undefined;
  @state() private error = '';
  private url?: ReturnType<typeof this.createState>;
  private createState() { return createUrlState(propertyQuery); }
  private unsubscribe?: () => void;
  private connectedBefore = false;
  private onSubmit = (event: Event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const input = new URLSearchParams(new FormData(form) as never);
    const values = propertyQuery.read(input);
    void this.url?.patch({ ...values, page: 1, view: this.view ?? 'list' }, { history: 'push', effect: 'revalidate' })
      .catch(() => { this.error = 'Results could not refresh. Use the native search link or retry.'; });
  };
  private onClick = (event: MouseEvent) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-view]');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void this.url?.patch({ view: link.dataset.view as 'list' | 'map' }, { history: 'push', effect: 'local' });
  };
  override connectedCallback() {
    super.connectedCallback();
    if (typeof window === 'undefined') return;
    this.url = createUrlState(propertyQuery, {
      mcp: {
        name: 'filter_properties',
        description: 'Filter, sort, paginate, or switch the property listings view',
      },
      revalidate: context => {
        // View-only history entries are local: result snapshots need no reload.
        const loaded = this.data?.query;
        const same = loaded && Object.keys(loaded).every(key => key === 'view' || loaded[key as keyof PropertyQuery] === context.values[key as keyof PropertyQuery]);
        return same ? Promise.resolve(() => {}) : revalidateUrlState(context);
      },
      onError: () => { this.error = 'Results could not refresh. Retry search or follow a native result link.'; },
    });
    this.unsubscribe = this.url.subscribe(({ values }) => { this.view = values.view; this.requestUpdate(); });
    this.url.start();
    if (this.connectedBefore) void this.url.refresh().catch(() => { this.error = 'Results could not refresh after reconnect. Retry search.'; });
    this.connectedBefore = true;
    this.addEventListener('submit', this.onSubmit);
    this.addEventListener('click', this.onClick);
  }
  override disconnectedCallback() {
    this.removeEventListener('submit', this.onSubmit);
    this.removeEventListener('click', this.onClick);
    this.unsubscribe?.();
    this.url?.dispose();
    this.url = undefined;
    super.disconnectedCallback();
  }
  override render() {
    if (!this.data) return html``;
    const { listings, map, pages } = this.data;
    const href = this.url?.current.href ?? this.data.href;
    const q = this.url?.current.values ?? this.data.query;
    const view = this.view ?? q.view;
    const unrelated = [...new URL(href).searchParams].filter(([key]) => !(key in q));
    return html`
      <form method="get" action="/listings" class="property-search">
        ${unrelated.map(([key, value]) => html`<input type="hidden" name=${key} value=${value}>`)}
        <input type="hidden" name="view" value=${view}>
        <label>Location or address <input name="q" type="search" maxlength="200" .value=${q.q}></label>
        <label>Minimum price <input name="min" type="number" min="0" max="1000000000" .value=${String(q.min)}></label>
        <label>Maximum price <input name="max" type="number" min="0" max="1000000000" .value=${String(q.max)}></label>
        <label>Property type <select name="kind">${['all', 'house', 'apartment', 'land'].map(value => html`<option value=${value} ?selected=${q.kind === value}>${value}</option>`)}</select></label>
        <label>Property status <select name="status">${['all', 'for-sale', 'pending', 'sold'].map(value => html`<option value=${value} ?selected=${q.status === value}>${value}</option>`)}</select></label>
        <label>Sort properties <select name="sort">${['recent', 'price-asc', 'price-desc', 'address'].map(value => html`<option value=${value} ?selected=${q.sort === value}>${value}</option>`)}</select></label>
        <button class="btn" type="submit">Search properties</button>
      </form>
      <nav aria-label="Property view">
        <a data-view="list" href=${propertyHref(href, { view: 'list' })} aria-current=${view === 'list' ? 'page' : 'false'}>List view</a>
        <a data-view="map" href=${propertyHref(href, { view: 'map' })} aria-current=${view === 'map' ? 'page' : 'false'}>Map view</a>
      </nav>
      <p role="alert" ?hidden=${!this.error}>${this.error} <a href=${href}>Native search results</a></p>
      <property-map .active=${view === 'map'} .listings=${listings} .config=${map}>${renderLight()}</property-map>
      <nav aria-label="Result pages">
        ${this.data.query.page > 1 ? html`<a href=${propertyHref(href, { page: this.data.query.page - 1 })}>Previous page</a>` : ''}
        ${this.data.query.page < pages ? html`<a href=${propertyHref(href, { page: this.data.query.page + 1 })}>Next page</a>` : ''}
      </nav>
    `;
  }
}
export default PropertyFilters;
