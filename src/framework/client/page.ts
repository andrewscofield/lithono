import { LitElement } from 'lit';
import type { PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { provide } from '@lit/context';
import type { ActionDescriptor, ActionFailureContext, ActionView } from '../types.ts';
import { Lithono } from './lithono.ts';
import { FormSubmitController } from './form-host.ts';
import { descriptorsFromMeta } from './action-view.ts';
import { actionsContext, pageDataContext, paramsContext, sessionContext } from './context.ts';
import { bindStateActions, getLithonoData, revalidatePage } from './data.ts';
import { defineWebMcpTool, getWebMcpAdapter, getWebMcpConfig } from '../webmcp/adapter.ts';
import type { WebMcpJsonSchema } from '../webmcp/types.ts';

export class LithonoPage extends Lithono(LitElement) {
  static root = 'light' as const;
  static tagName = 'lithono-page';
  static hydrate = false;

  @provide({ context: pageDataContext })
  @property({ attribute: false })
  data: unknown;

  @provide({ context: paramsContext })
  @property({ attribute: false })
  params: Record<string, string> = {};

  @property({ attribute: false })
  url: URL | string | undefined;

  @property({ attribute: false })
  descriptors: Record<string, ActionDescriptor> = {};

  @property({ attribute: false })
  failure: ActionFailureContext | undefined;

  @property({ attribute: false })
  path = '';

  @provide({ context: sessionContext })
  @property({ attribute: false })
  session: unknown;

  #formController = new FormSubmitController(this);
  #pageMcpCleanups: Array<() => void> = [];
  #pageMcpConnected = false;

  constructor() {
    super();
    this.setAttribute('data-lithono-page', '');
  }

  override connectedCallback() {
    if (typeof document !== 'undefined' && typeof document.getElementById === 'function') this.applyBootData();
    super.connectedCallback();
    this.#pageMcpConnected = true;
    this.#syncPageWebMcpTools();
    this.setAttribute('data-lithono-page', '');
    this.addEventListener('lithono:revalidate', this.#onRevalidate as EventListener);
  }

  override disconnectedCallback() {
    this.#pageMcpConnected = false;
    this.#unregisterPageWebMcpTools();
    this.removeEventListener('lithono:revalidate', this.#onRevalidate as EventListener);
    super.disconnectedCallback();
  }

  get pageUrl(): URL {
    if (this.url instanceof URL) return this.url;
    if (typeof this.url === 'string' && this.url) {
      return new URL(this.url, typeof window === 'undefined' ? 'http://lithono.local' : window.location.origin);
    }
    const path = this.path || (typeof window === 'undefined' ? '/' : window.location.pathname);
    return new URL(path, typeof window === 'undefined' ? 'http://lithono.local' : window.location.origin);
  }

  get actionMap(): ActionView {
    const boot = getLithonoData();
    const path = this.path || boot.path || this.pageUrl.pathname;
    const descriptors = Object.keys(this.descriptors).length
      ? this.descriptors
      : descriptorsFromMeta(path, boot.actions);
    const bound = bindStateActions(descriptors, this.pageUrl.href, this.failure);
    return new Proxy(bound, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && prop !== 'then' && !(prop in target)) {
          const known = Object.keys(target).join(', ') || '(none)';
          throw new Error(`Lithono: unknown action "${prop}". Known actions: ${known}`);
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as ActionView;
  }

  @provide({ context: actionsContext })
  @property({ attribute: false })
  providedActions: ActionView = {} as ActionView;

  override willUpdate(changed: PropertyValues) {
    if (['descriptors', 'path', 'url', 'failure'].some((key) => changed.has(key))) {
      this.providedActions = this.actionMap;
    }
    if (this.#pageMcpConnected && ['descriptors', 'path', 'url'].some((key) => changed.has(key))) {
      this.#syncPageWebMcpTools();
    }
  }

  override async revalidate(): Promise<void> {
    await revalidatePage();
  }

  applyBootData() {
    const boot = getLithonoData();
    this.data = boot.data;
    this.params = boot.params;
    this.path = boot.path;
    this.url = boot.url;
    this.failure = boot.failure;
    this.session = boot.session;
    this.descriptors = descriptorsFromMeta(boot.path, boot.actions);
    if (this.#pageMcpConnected) {
      this.#syncPageWebMcpTools();
    }
  }

  #unregisterPageWebMcpTools() {
    while (this.#pageMcpCleanups.length) {
      const cleanup = this.#pageMcpCleanups.pop()!;
      try {
        cleanup();
      } catch {
        // Ignore cleanup errors during disconnect/navigation
      }
    }
  }

  #syncPageWebMcpTools() {
    this.#unregisterPageWebMcpTools();
    if (!this.#pageMcpConnected) return;

    const config = getWebMcpConfig();
    const boot = getLithonoData();
    const pageMcp = boot.mcp;
    if (!config.enabled || !config.autoActions || pageMcp === false) return;
    if (typeof pageMcp === 'object' && (pageMcp.enabled === false || pageMcp.actions === false)) {
      return;
    }

    const pagePrefix = typeof pageMcp === 'object' && pageMcp.prefix ? pageMcp.prefix : '';
    const pageActions =
      typeof pageMcp === 'object' && typeof pageMcp.actions === 'object'
        ? pageMcp.actions
        : undefined;
    const adapter = getWebMcpAdapter();

    for (const [actionName, meta] of Object.entries(boot.actions ?? {})) {
      const override = pageActions?.[actionName];
      const metaMcp = meta.mcp;
      if (metaMcp === false || override === false) continue;
      if (typeof metaMcp === 'object' && metaMcp.enabled === false) continue;
      if (typeof override === 'object' && override.enabled === false) continue;

      const metaObj = typeof metaMcp === 'object' ? metaMcp : undefined;
      const overrideObj = typeof override === 'object' ? override : undefined;

      const toolName =
        overrideObj?.name ??
        metaObj?.name ??
        `${config.prefix}${pagePrefix}${actionName}`;
      const description =
        overrideObj?.description ??
        metaObj?.description ??
        meta.description ??
        `Execute ${actionName} action`;
      const annotations = {
        ...metaObj?.annotations,
        ...overrideObj?.annotations,
      };
      const inputSchema: WebMcpJsonSchema = meta.inputSchema ?? {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(meta.fields ?? {}).map(([fieldName, field]) => [
            fieldName,
            {
              type:
                field.type === 'checkbox'
                  ? 'boolean'
                  : field.type === 'number'
                    ? field.step === 1
                      ? 'integer'
                      : 'number'
                    : 'string',
              ...(field.description ? { description: field.description } : {}),
              ...(field.enum?.length ? { enum: field.enum } : {}),
            },
          ])
        ),
      };

      const cleanup = adapter.register(
        defineWebMcpTool({
          name: toolName,
          description,
          inputSchema,
          ...(Object.keys(annotations).length ? { annotations } : {}),
          source: 'page-action',
          execute: async (input) => {
            const bound = this.actionMap as Record<string, (payload?: unknown) => Promise<unknown>>;
            const fn = bound[actionName];
            if (typeof fn !== 'function') {
              throw new Error(`Lithono: action "${actionName}" is unavailable`);
            }
            return await fn(input);
          },
        })
      );
      this.#pageMcpCleanups.push(cleanup);
    }
  }

  #onRevalidate = () => {
    this.applyBootData();
  };
}
