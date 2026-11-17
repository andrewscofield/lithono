import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ActionRequestError, LithonoElement } from 'lithono/client';
import type { LithonoFormSuccessDetail } from 'lithono/client';
import type { PageActions } from '../../pages/listings/[id]/page.ts';
import './listing-price.css';

@customElement('listing-price')
export class ListingPriceElement extends LithonoElement {
  static root = 'light' as const;
  static hydrate = true;
  @property({ type: Number })
  price = 0;

  @state()
  private message = '';

  @state()
  private pending = false;

  #formHost?: HTMLElement;

  #onSuccess = (event: Event) => {
    const detail = (event as CustomEvent<LithonoFormSuccessDetail>).detail;
    if (detail?.action !== 'updatePrice') return;
    const result = detail.result as { newPrice?: number } | undefined;
    if (typeof result?.newPrice === 'number') {
      this.price = result.newPrice;
      this.message = `Updated to $${result.newPrice.toLocaleString()}`;
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    // SSR runs the synchronous connected lifecycle to wire data/context. DOM
    // traversal and enhanced-form event handling belong to the browser only.
    if (typeof window === 'undefined') return;
    this.#formHost = this.closest<HTMLElement>('[data-lithono-page]') ?? undefined;
    this.#formHost?.addEventListener('lithono:success', this.#onSuccess);
  }

  override disconnectedCallback() {
    this.#formHost?.removeEventListener('lithono:success', this.#onSuccess);
    this.#formHost = undefined;
    super.disconnectedCallback();
  }

  private async applyDiscount() {
    if (this.pending) return;
    this.pending = true;
    this.message = '';
    try {
      const actions = this.actions<PageActions>();
      const next = Math.max(10000, this.price - 10000);
      const result = await actions.updatePrice({
        price: next,
        reason: 'Seller concession',
      });
      this.price = result.newPrice;
      this.message = `Updated to $${result.newPrice.toLocaleString()}`;
    } catch (error) {
      this.message = error instanceof ActionRequestError && error.status === 401
        ? 'Sign in to update this listing’s price.'
        : error instanceof Error ? error.message : 'Unable to update the price. Please try again.';
    } finally {
      this.pending = false;
    }
  }

  override render() {
    return html`
      <p class="price" data-price>$${this.price.toLocaleString()}</p>
      <div class="actions">
        <button class="btn" type="button" ?disabled=${this.pending} @click=${() => this.applyDiscount()}>
          ${this.pending ? 'Applying discount…' : 'Apply $10,000 discount'}
        </button>
      </div>
      ${this.message ? html`<p role="status">${this.message}</p>` : nothing}
    `;
  }
}

export default ListingPriceElement;

declare global {
  interface HTMLElementTagNameMap {
    'listing-price': ListingPriceElement;
  }
}
