import { html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LithonoElement } from 'lithono/client';
import type { Map as LibreMap, Marker } from 'maplibre-gl';
import type { Property } from '../../server/repositories/properties.ts';

@customElement('property-map')
export class PropertyMap extends LithonoElement {
  static root = 'light' as const;
  static hydrate = true;
  @property({ type: Boolean }) active = false;
  @property({ attribute: false }) listings: Property[] = [];
  @property({ attribute: false }) config: { styleUrl?: string; attribution?: string } = {};
  @state() private status = 'Map loading…';
  private map?: LibreMap;
  private markers: Marker[] = [];
  private generation = 0;
  private loading = false;
  private sdk?: typeof import('maplibre-gl');
  override connectedCallback() {
    super.connectedCallback();
    this.requestUpdate();
  }
  override disconnectedCallback() {
    ++this.generation;
    this.loading = false;
    this.markers.forEach(marker => marker.remove());
    this.markers = [];
    this.map?.remove();
    this.map = undefined;
    super.disconnectedCallback();
  }
  protected override updated() {
    if (typeof window === 'undefined') return;
    if (this.active && this.config.styleUrl && !this.map && !this.loading) void this.activate();
    if (this.map) { this.map.resize(); this.updateMarkers(); }
  }
  private async activate() {
    const generation = ++this.generation;
    this.loading = true;
    try {
      // Neither the SDK nor its CSS/worker/style is requested on a list visit.
      const [sdk] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
      if (!this.isConnected || generation !== this.generation) return;
      if (!this.active) { this.loading = false; return; }
      this.sdk = sdk;
      this.map = new sdk.Map({
        container: this.querySelector<HTMLElement>('[data-map-container]')!,
        style: this.config.styleUrl!, center: [-122.7, 45.2], zoom: 6,
        attributionControl: { customAttribution: this.config.attribution ?? '' },
      });
      this.map.on('load', () => { this.status = 'Map ready. Markers link to property details; results remain in the list below.'; });
      this.map.on('error', () => { this.status = 'Map style or tiles could not load. Use the property list below, or check the configured style provider.'; });
      this.updateMarkers();
    } catch {
      if (generation === this.generation) this.status = 'Map could not start in this browser. Use the property list below.';
    }
    // Keep failure visible; do not retry continuously on each render.
  }
  private updateMarkers() {
    if (!this.map || !this.sdk) return;
    this.markers.forEach(marker => marker.remove());
    this.markers = this.listings.filter(item => item.longitude != null && item.latitude != null).map(item => {
      const link = document.createElement('a');
      link.href = `/listings/${encodeURIComponent(item.id)}`;
      link.textContent = '📍';
      link.setAttribute('aria-label', item.address);
      return new this.sdk!.Marker({ element: link }).setLngLat([item.longitude!, item.latitude!]).addTo(this.map!);
    });
  }
  override render() {
    return html`<section ?hidden=${!this.active} aria-label="Property map">
      <p role="status">${!this.config.styleUrl
        ? 'Map unavailable: set LITHONO_MAP_STYLE_URL to a public MapLibre style URL and LITHONO_MAP_ATTRIBUTION for its provider. Search and browse the property list below.'
        : this.status}</p>
      <div data-map-container></div>
      <p>Map shows this results page only. Panning does not change the search. Properties without coordinates remain in the list.</p>
    </section>`;
  }
}
export default PropertyMap;
