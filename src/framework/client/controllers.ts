import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { ContextConsumer } from '@lit/context';
import type { ActionDefinition, InferActionClient } from '../types.ts';
import { actionsContext, pageDataContext, paramsContext, sessionContext } from './context.ts';
import { getActions, getPageData, getParams, getLithonoData, revalidateUrlState } from './data.ts';
import type { QueryDefinition, QueryShape, QueryValues } from '../url.ts';
import { createUrlState } from './url-state.ts';
import type { UrlStateOptions } from './url-state.ts';

type Host = ReactiveControllerHost & HTMLElement;

export class PageDataController<T = unknown> implements ReactiveController {
  #consumer: ContextConsumer<{ __context__: T }, Host>;
  host: Host;

  constructor(host: Host) {
    this.host = host;
    this.#consumer = new ContextConsumer(host, { context: pageDataContext as never, subscribe: true });
    host.addController(this);
  }

  get value(): T {
    return (this.#consumer.value !== undefined ? this.#consumer.value : getPageData<T>()) as T;
  }

  hostConnected(): void {}
  hostDisconnected(): void {}
}

export class ActionsController<TActions = Record<string, ActionDefinition>> implements ReactiveController {
  #consumer: ContextConsumer<{ __context__: InferActionClient<TActions> }, Host>;
  host: Host;

  constructor(host: Host) {
    this.host = host;
    this.#consumer = new ContextConsumer(host, { context: actionsContext as never, subscribe: true });
    host.addController(this);
  }

  get value(): InferActionClient<TActions> {
    return (this.#consumer.value as InferActionClient<TActions> | undefined) ?? getActions<TActions>();
  }

  hostConnected(): void {}
  hostDisconnected(): void {}
}

export class ParamsController implements ReactiveController {
  #consumer: ContextConsumer<{ __context__: Record<string, string> }, Host>;
  host: Host;

  constructor(host: Host) {
    this.host = host;
    this.#consumer = new ContextConsumer(host, { context: paramsContext, subscribe: true });
    host.addController(this);
  }

  get value(): Record<string, string> {
    return this.#consumer.value ?? getParams();
  }

  hostConnected(): void {}
  hostDisconnected(): void {}
}

export class SessionController<T = unknown> implements ReactiveController {
  #consumer: ContextConsumer<{ __context__: T }, Host>;
  host: Host;

  constructor(host: Host) {
    this.host = host;
    this.#consumer = new ContextConsumer(host, { context: sessionContext as never, subscribe: true });
    host.addController(this);
  }

  get value(): T | undefined {
    return (this.#consumer.value !== undefined ? this.#consumer.value : getLithonoData().session) as T | undefined;
  }

  hostConnected(): void {}
  hostDisconnected(): void {}
}

/** Optional Lit lifecycle adapter. Construction and value reads are SSR-safe;
 * history listeners are installed only while the host is connected in a browser.
 */
export class UrlController<S extends QueryShape> implements ReactiveController {
  #state?: ReturnType<typeof createUrlState<S>>;
  #unsubscribe?: () => void;

  constructor(
    readonly host: ReactiveControllerHost,
    readonly definition: QueryDefinition<S>,
    readonly options: UrlStateOptions<S> = {},
  ) {
    host.addController(this);
  }

  get state(): ReturnType<typeof createUrlState<S>> {
    return this.#state ??= createUrlState(this.definition, { revalidate: revalidateUrlState, ...this.options });
  }

  get value(): QueryValues<S> {
    return this.#state?.current.values ?? this.definition.read(new URL(getLithonoData().url ?? 'http://lithono.local/'), this.options);
  }

  hostConnected(): void {
    if (typeof window === 'undefined' && !this.options.environment) return;
    this.state.start();
    this.#unsubscribe ??= this.state.subscribe(() => this.host.requestUpdate());
  }

  hostDisconnected(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#state?.stop();
  }

  dispose(): void {
    this.hostDisconnected();
    this.#state?.dispose();
  }
}
