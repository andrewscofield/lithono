import { LitElement, html, svg } from 'lit';
import { property } from 'lit/decorators.js';

/** Ordinary Lit, default shadow root; loader data only, no URL or subscriptions. */
export class DashboardChart extends LitElement {
  @property({ attribute: false }) points: { day: string; completed: number }[] = [];
  override render() {
    const max = Math.max(1, ...this.points.map(point => point.completed));
    return html`<svg viewBox="0 0 320 100" role="img" aria-label="Completed tasks by recorded day" style="width:100%;max-width:40rem">
      ${this.points.map((point, index) => svg`<rect x=${index * 320 / this.points.length} y=${90 - point.completed / max * 80}
        width=${Math.max(1, 320 / this.points.length - 3)} height=${point.completed / max * 80} fill="currentColor" aria-label=${`${point.day}: ${point.completed}`}></rect>`)}
    </svg>`;
  }
}
if (!customElements.get('dashboard-chart')) customElements.define('dashboard-chart', DashboardChart);
