import { createUrlState, revalidateUrlState } from 'lithono/client';
import { inventoryQuery } from '../../lib/inventory-query.ts';
if (typeof HTMLElement !== 'undefined') {
class InventoryView extends HTMLElement {
  private createState() { return createUrlState(inventoryQuery, { revalidate: revalidateUrlState }); }
  private url?: ReturnType<InventoryView['createState']>;
  private submit = (event: Event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.method !== 'get') return;
    event.preventDefault();
    const input = inventoryQuery.read(new URLSearchParams(new FormData(form) as never));
    void this.url?.patch({ ...input, page: 1 }, { history: 'push', effect: 'revalidate' }).catch(() => { this.querySelector('[data-url-error]')!.textContent = 'Inventory refresh failed; use native links or retry.'; });
  };
  connectedCallback() { this.url = this.createState(); this.url.start(); this.addEventListener('submit', this.submit); }
  disconnectedCallback() { this.url?.dispose(); this.removeEventListener('submit', this.submit); }
}
if (typeof customElements !== 'undefined' && !customElements.get('inventory-view')) customElements.define('inventory-view', InventoryView);
}
