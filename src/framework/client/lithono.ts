import { LitElement, ReactiveElement, render } from 'lit';
import { hydrateOwned } from './lit-ownership-compat.ts';
import type { PropertyValues, ReactiveControllerHost } from 'lit';
import type { ActionDefinition, InferActionClient, RootKind } from '../types.ts';
import type { WebMcpToolDefinition } from '../webmcp/types.ts';
import { getActions, getLithonoData, getPageData, revalidatePage } from './data.ts';
import { hasLitPartMarkers } from './ssr-markers.ts';
import {
  collectDecoratedWebMcpTools,
  hasWebMcpDecoratorOwner,
  WebMcpController,
} from './webmcp-controller.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = object> = new (...args: any[]) => T;

export type { RootKind };

export function detachedRenderRoot(): HTMLElement | DocumentFragment {
  if (typeof document === 'undefined') {
    return { nodeType: 11 } as DocumentFragment;
  }
  return document.createDocumentFragment();
}

export interface LithonoHost {
  staticRoot: RootKind;
  pageData<T = unknown>(): T;
  actions<TActions = Record<string, ActionDefinition>>(): InferActionClient<TActions>;
  readonly lithono: ReturnType<typeof getLithonoData>;
  revalidate(): Promise<void>;
  registerWebMcpTool<TInput = Record<string, unknown>, TOutput = unknown>(
    tool: WebMcpToolDefinition<TInput, TOutput>
  ): () => void;
}

export function Lithono<TBase extends Constructor<HTMLElement>>(
  Base: TBase
): TBase & Constructor<LithonoHost> {
  class LithonoElementMixin extends Base {
    static root: RootKind = 'light';
    static lithonoStyles: string[] = [];
    #webMcpController?: WebMcpController;

    get staticRoot(): RootKind {
      return ((this.constructor as typeof LithonoElementMixin).root ?? 'light') as RootKind;
    }

    connectedCallback(): void {
      const parent = Object.getPrototypeOf(LithonoElementMixin.prototype) as {
        connectedCallback?: () => void;
      };
      parent.connectedCallback?.call(this);
      const host = this as unknown as Partial<ReactiveControllerHost>;
      if (
        !this.#webMcpController &&
        collectDecoratedWebMcpTools(this).length > 0 &&
        typeof host.addController === 'function' &&
        !hasWebMcpDecoratorOwner(host as ReactiveControllerHost)
      ) {
        this.#webMcpController = new WebMcpController(host as ReactiveControllerHost);
        this.#webMcpController.hostConnected();
      }
    }

    disconnectedCallback(): void {
      const parent = Object.getPrototypeOf(LithonoElementMixin.prototype) as {
        disconnectedCallback?: () => void;
      };
      parent.disconnectedCallback?.call(this);
    }

    registerWebMcpTool<TInput = Record<string, unknown>, TOutput = unknown>(
      tool: WebMcpToolDefinition<TInput, TOutput>
    ): () => void {
      const host = this as unknown as Partial<ReactiveControllerHost> & { isConnected?: boolean };
      if (!this.#webMcpController) {
        if (typeof host.addController !== 'function') {
          throw new Error('Lithono: registerWebMcpTool requires a Lit ReactiveControllerHost element');
        }
        this.#webMcpController = new WebMcpController(host as ReactiveControllerHost);
        if (host.isConnected) {
          this.#webMcpController.hostConnected();
        }
      }
      return this.#webMcpController.register(tool);
    }

    protected createRenderRoot(): HTMLElement | ShadowRoot | DocumentFragment {
      const kind = this.staticRoot;
      if (kind === 'light') {
        return this;
      }
      if (kind === 'host') return detachedRenderRoot();
      // The supported Lit hydration hook adopts declarative shadow roots.
      const parent = Object.getPrototypeOf(LithonoElementMixin.prototype) as { createRenderRoot?: () => ShadowRoot };
      return parent.createRenderRoot?.call(this) ?? this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    }

    renderLight() {
      if (this.staticRoot === 'shadow') return undefined;
      const render = (this as unknown as { render?: () => unknown }).render;
      return render?.call(this);
    }

    pageData<T = unknown>(): T {
      return getPageData<T>();
    }

    actions<TActions = Record<string, ActionDefinition>>(): InferActionClient<TActions> {
      const fromPage = actionMapFromAncestors(this);
      if (fromPage) return fromPage as InferActionClient<TActions>;
      return getActions<TActions>();
    }

    get lithono() {
      return getLithonoData();
    }

    async revalidate(): Promise<void> {
      await revalidatePage();
    }

    protected update(changedProperties: PropertyValues): void {
      const litUpdate = Object.getPrototypeOf(LithonoElementMixin.prototype) as {
        update?: (changed: PropertyValues) => void;
      };
      const reactiveUpdate = ReactiveElement.prototype as unknown as {
        update?: (changed: PropertyValues) => void;
      };
      if (this.staticRoot !== 'light') {
        litUpdate.update?.call(this, changedProperties);
        return;
      }
      const host = this as unknown as LitElement & { render(): unknown };
      const value = host.render();
      reactiveUpdate.update?.call(this, changedProperties);
      // Detect SSR at the actual render boundary, including ordinary Lit
      // components that override createRenderRoot() to return their light root.
      if (!host.hasUpdated && typeof document !== 'undefined'
          && typeof document.createTreeWalker === 'function' && hasLitPartMarkers(host.renderRoot)) {
        hydrateOwned(value, host.renderRoot, host.renderOptions);
      } else {
        render(value, host.renderRoot, host.renderOptions);
      }
    }
  }

  return LithonoElementMixin as unknown as TBase & Constructor<LithonoHost>;
}

function actionMapFromAncestors(el: HTMLElement): unknown {
  let node = el.parentElement;
  while (node) {
    const map = (node as HTMLElement & { actionMap?: unknown }).actionMap;
    if (map && typeof map === 'object' && Object.keys(map as object).length > 0) {
      return map;
    }
    node = node.parentElement;
  }
  return undefined;
}

export class LithonoElement extends Lithono(LitElement) {
  static root: RootKind = 'light';
}
