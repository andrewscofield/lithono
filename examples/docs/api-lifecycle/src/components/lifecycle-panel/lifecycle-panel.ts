import { state } from 'lit/decorators.js';
import {
  html, LithonoElement, PageDataController, ActionsController, ParamsController,
  SessionController, UrlController, pageData, session, navigate,
} from 'lithono/client';
import type { LithonoFormSuccessDetail, LithonoFormErrorDetail } from 'lithono/client';
import type { actions as routeActions } from '@/pages/page.ts';
import { demoQuery } from '@/lib/demo-query.ts';
import type { DemoData } from '@/lib/demo-query.ts';

export default class LifecyclePanel extends LithonoElement {
  page = new PageDataController<DemoData>(this);
  actionState = new ActionsController<typeof routeActions>(this);
  params = new ParamsController(this);
  session = new SessionController<{ label: string }>(this);
  query = new UrlController(this, demoQuery);
  @pageData() consumed: unknown;
  @session() consumedSession: unknown;
  @state() message = 'No form event yet';
  @state() refreshError = '';
  @state() navigationError = '';
  #owner?: Element;

  override connectedCallback() {
    super.connectedCallback();
    if (typeof document === 'undefined') return;
    this.#owner = this.closest('[data-lithono-page]') ?? undefined;
    this.#owner?.addEventListener('lithono:success', this.#success);
    this.#owner?.addEventListener('lithono:error', this.#error);
    this.#owner?.addEventListener('lithono:revalidate-error', this.#refreshError);
    document.addEventListener('lithono:navigation-error', this.#navigationError);
  }

  override disconnectedCallback() {
    this.#owner?.removeEventListener('lithono:success', this.#success);
    this.#owner?.removeEventListener('lithono:error', this.#error);
    this.#owner?.removeEventListener('lithono:revalidate-error', this.#refreshError);
    if (typeof document !== 'undefined') document.removeEventListener('lithono:navigation-error', this.#navigationError);
    super.disconnectedCallback();
  }

  #success = (event: Event) => { this.message = `Form action: ${(event as CustomEvent<LithonoFormSuccessDetail>).detail.action}`; };
  #error = (event: Event) => { this.message = (event as CustomEvent<LithonoFormErrorDetail>).detail.message; };
  #refreshError = () => { this.refreshError = 'Write succeeded; refresh the view before retrying.'; };
  #navigationError = () => { this.navigationError = 'Navigation failed; the existing view remains.'; };

  commit = async () => {
    try { await this.actionState.value.commit({ mode: 'refresh-fails' }); }
    catch (error) { this.message = error instanceof Error ? error.message : 'Request failed'; }
  };
  refresh = async () => {
    try { await this.revalidate(); this.refreshError = ''; }
    catch (error) { this.refreshError = error instanceof Error ? error.message : 'Refresh failed'; }
  };
  next = async () => {
    try { await this.query.state.patch({ page: this.query.value.page + 1 }, { history: 'push', effect: 'revalidate' }); }
    catch (error) { this.message = error instanceof Error ? error.message : 'Query refresh failed'; }
  };
  failNavigation = () => { void navigate('/unavailable'); };

  render() {
    const contextData = this.consumed as DemoData | undefined;
    const contextSession = this.consumedSession as { label: string } | undefined;
    return html`
      <p data-count>Snapshot count: ${this.page.value?.count ?? 0}</p>
      <p data-context>Context count: ${contextData?.count ?? 'waiting for provider'}</p>
      <p data-session>Public session: ${this.session.value?.label ?? 'Guest'}</p>
      <p data-decorated-session>Decorated session: ${contextSession?.label ?? 'waiting for provider'}</p>
      <p>Route parameter count: ${Object.keys(this.params.value).length}</p>
      <p data-param>Route parameter id: ${this.params.value.id ?? '(root)'}</p>
      <p data-query>Query page: ${this.query.value.page}</p>
      <button @click=${this.next}>Next query page</button>
      <button @click=${this.commit}>Commit with failed refresh</button>
      <button @click=${this.refresh}>Refresh view</button>
      <button @click=${this.failNavigation}>Try unavailable page</button>
      <p role="status" data-form-event>${this.message}</p>
      <p data-refresh-error>${this.refreshError}</p>
      <p data-navigation-error>${this.navigationError}</p>
    `;
  }
}
