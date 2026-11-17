import { LitElement } from 'lit';
import { renderLight } from './render-light.ts';
import { property } from 'lit/decorators.js';
import { Lithono } from './lithono.ts';
import { FormSubmitController } from './form-host.ts';
import { getLithonoData } from './data.ts';

export class LithonoLayout extends Lithono(LitElement) {
  static root = 'light' as const;
  static tagName = 'lithono-layout';
  static hydrate = false;

  @property({ attribute: false })
  data: unknown;

  @property({ attribute: false })
  params: Record<string, string> = {};

  @property({ attribute: false })
  url: URL | string | undefined;

  @property({ attribute: false })
  pageChildren: unknown;

  @property({ attribute: false })
  path = '';

  @property({ attribute: 'data-lithono-layout-id', reflect: true })
  layoutId = '';

  #formController = new FormSubmitController(this);

  constructor() {
    super();
    this.setAttribute('data-lithono-layout', '');
  }

  override connectedCallback() {
    if (typeof document !== 'undefined' && typeof document.getElementById === 'function') this.applyBootData();
    super.connectedCallback();
    this.setAttribute('data-lithono-layout', '');
    this.addEventListener('lithono:revalidate', this.#onRevalidate as EventListener);
  }

  override disconnectedCallback() {
    this.removeEventListener('lithono:revalidate', this.#onRevalidate as EventListener);
    super.disconnectedCallback();
  }

  get pageUrl(): URL {
    if (this.url instanceof URL) return this.url;
    if (typeof this.url === 'string' && this.url) {
      return new URL(this.url, typeof window === 'undefined' ? 'http://lithono.local' : window.location.origin);
    }
    return new URL(this.path || '/', typeof window === 'undefined' ? 'http://lithono.local' : window.location.origin);
  }

  applyBootData() {
    const boot = getLithonoData();
    this.data = boot.layouts?.find((layout) => layout.id === this.layoutId)?.data;
    this.params = boot.params;
    this.path = boot.path;
    this.url = boot.url;
    // The outlet is an opaque child part, never a node to move or re-stamp.
    this.pageChildren = renderLight();
  }

  #onRevalidate = () => {
    this.applyBootData();
  };
}
