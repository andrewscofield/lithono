import { html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LithonoElement } from 'lithono/client';
import type { LithonoFormSuccessDetail } from 'lithono/client';
import type { Item } from '../../server/repositories/inventory.ts';
@customElement('inventory-editor')
export class InventoryEditor extends LithonoElement {
  static root = 'light' as const;
  @property({ attribute: false }) item!: Item;
  @property() destination = '';
  @state() private draft?: { stock: string; threshold: string; version: number; reason: string };
  private formHost?: HTMLElement;
  private success = (event: Event) => {
    const detail = (event as CustomEvent<LithonoFormSuccessDetail>).detail;
    const result = detail?.result as { saved?: boolean; item?: Item; reason?: string } | undefined;
    if (detail?.action !== 'adjust' || !result?.saved || !result.item || result.item.id !== this.item?.id || !this.draft) return;
    const saved = result.item;
    const matches = Number(this.draft.stock) === saved.stock
      && Number(this.draft.threshold) === saved.threshold && this.draft.reason.trim() === result.reason;
    // Acknowledge our saved version, retaining anything typed while it was in
    // flight. Unrelated row refreshes never rebase another row's draft.
    this.draft = matches ? undefined : { ...this.draft, version: saved.version };
  };
  override connectedCallback() {
    super.connectedCallback();
    if (typeof window === 'undefined') return;
    this.formHost = this.closest<HTMLElement>('[data-lithono-page]') ?? undefined;
    this.formHost?.addEventListener('lithono:success', this.success);
  }
  override disconnectedCallback() {
    this.formHost?.removeEventListener('lithono:success', this.success);
    this.formHost = undefined;
    super.disconnectedCallback();
  }
  protected override willUpdate() {
    if (typeof window === 'undefined' || this.hasUpdated || this.draft || !this.item) return;
    const stock = this.querySelector<HTMLInputElement>('[name=stock]');
    const threshold = this.querySelector<HTMLInputElement>('[name=threshold]');
    const reason = this.querySelector<HTMLInputElement>('[name=reason]');
    if (stock && threshold && reason && [stock, threshold, reason].some(input => input.value !== input.defaultValue)) {
      this.draft = { stock: stock.value, threshold: threshold.value, reason: reason.value,
        version: Number(this.querySelector<HTMLInputElement>('[name=version]')?.value) || this.item.version };
    }
  }
  private change(key: 'stock' | 'threshold' | 'reason', event: Event) {
    this.draft ??= { stock: String(this.item.stock), threshold: String(this.item.threshold), version: this.item.version, reason: '' };
    this.draft = { ...this.draft, [key]: (event.target as HTMLInputElement).value };
  }
  override render() {
    if (!this.item) return html``;
    const i = this.item; const d = this.draft;
    return html`<details><summary>Edit ${i.sku}</summary><p>Server stock ${i.stock}; version ${i.version}. Draft uses version ${d?.version ?? i.version}.</p>
      <form method="post" action=${this.destination}>
        <input type="hidden" name="id" value=${i.id}><input type="hidden" name="version" value=${d?.version ?? i.version}>
        <p data-form-error hidden></p>
        <label>Stock <input name="stock" type="number" min="0" max="1000000" required .value=${d?.stock ?? String(i.stock)} @input=${(e: Event) => this.change('stock', e)}></label>
        <label>Threshold <input name="threshold" type="number" min="0" max="1000000" required .value=${d?.threshold ?? String(i.threshold)} @input=${(e: Event) => this.change('threshold', e)}></label>
        <label>Reason <input name="reason" required maxlength="200" .value=${d?.reason ?? ''} @input=${(e: Event) => this.change('reason', e)}></label>
        <button type="submit">Save ${i.sku}</button>
        <button type="button" @click=${() => { this.draft = undefined; }}>Reload current values</button>
      </form><a href="/inventory/${i.id}">Native edit and audit</a></details>`;
  }
}
