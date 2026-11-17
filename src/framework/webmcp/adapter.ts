import { validateSchema } from '../standard-schema.ts';
import type {
  NativeModelContext,
  NativeModelContextTool,
  WebMcpAdapter,
  WebMcpBridge,
  WebMcpExecutionContext,
  WebMcpFormDescriptor,
  WebMcpGlobalConfig,
  WebMcpJsonSchema,
  WebMcpRegisteredTool,
  WebMcpToolDefinition,
} from './types.ts';

const LITHONO_POLYFILL = Symbol.for('lithono.webmcp.polyfill');

const DEFAULT_CONFIG: Required<WebMcpGlobalConfig> = {
  enabled: true,
  fallback: true,
  prefix: '',
  declarativeForms: true,
  autoActions: true,
  resultFormat: 'auto',
};

let globalConfig: Required<WebMcpGlobalConfig> = { ...DEFAULT_CONFIG };
let activeAdapter: WebMcpAdapter | undefined;

interface StoredTool {
  name: string;
  description: string;
  inputSchema: WebMcpJsonSchema;
  schema?: WebMcpToolDefinition['schema'];
  annotations?: WebMcpToolDefinition['annotations'];
  source?: WebMcpToolDefinition['source'];
  execute: (input: unknown, context: WebMcpExecutionContext) => Promise<unknown> | unknown;
  controller: AbortController;
  disposer?: () => void;
}

function stripSchemaMeta(schema: WebMcpJsonSchema): WebMcpJsonSchema {
  const copy: WebMcpJsonSchema = { ...schema };
  delete copy.$schema;
  return copy;
}

function schemaToJsonSchema(schema: unknown): WebMcpJsonSchema | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const withMethod = schema as { toJSONSchema?: () => unknown };
  if (typeof withMethod.toJSONSchema === 'function') {
    try {
      const json = withMethod.toJSONSchema();
      if (json && typeof json === 'object') {
        return stripSchemaMeta(json as WebMcpJsonSchema);
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function defineWebMcpTool<
  TInput = Record<string, unknown>,
  TOutput = unknown,
>(tool: WebMcpToolDefinition<TInput, TOutput>): WebMcpToolDefinition<TInput, TOutput> {
  const inputSchema =
    tool.inputSchema ??
    schemaToJsonSchema(tool.schema) ??
    ({ type: 'object', properties: {} } satisfies WebMcpJsonSchema);
  return {
    ...tool,
    inputSchema,
  };
}

export function mcpForm(options: {
  name: string;
  description: string;
  autosubmit?: boolean;
}): Record<string, string> {
  return {
    toolname: options.name,
    tooldescription: options.description,
    ...(options.autosubmit ? { toolautosubmit: '' } : {}),
  };
}

export function mcpParam(description: string): Record<string, string> {
  return {
    toolparamdescription: description,
  };
}

function isPolyfill(mc: NativeModelContext | undefined): boolean {
  return Boolean(mc && (mc as unknown as Record<symbol, unknown>)[LITHONO_POLYFILL]);
}

function getNativeModelContext(): NativeModelContext | undefined {
  if (typeof navigator !== 'undefined' && navigator.modelContext && !isPolyfill(navigator.modelContext)) {
    return navigator.modelContext;
  }
  if (typeof document !== 'undefined' && document.modelContext && !isPolyfill(document.modelContext)) {
    return document.modelContext;
  }
  return undefined;
}

function formatNativeResult(
  result: unknown,
  format: Required<WebMcpGlobalConfig>['resultFormat']
): unknown {
  if (format === 'raw') return result;
  if (format === 'json-string') {
    return typeof result === 'string' ? result : JSON.stringify(result ?? null);
  }
  if (format === 'mcp-content') {
    if (
      result &&
      typeof result === 'object' &&
      Array.isArray((result as { content?: unknown }).content)
    ) {
      return result;
    }
    const text = typeof result === 'string' ? result : JSON.stringify(result ?? null);
    return { content: [{ type: 'text', text }] };
  }
  if (result === undefined) return '';
  if (typeof result === 'string') return result;
  if (
    result &&
    typeof result === 'object' &&
    Array.isArray((result as { content?: unknown }).content)
  ) {
    return result;
  }
  return JSON.stringify(result);
}

function formControlSchema(control: Element): WebMcpJsonSchema | null {
  if (
    !(
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    )
  ) {
    return null;
  }
  const name = control.name;
  if (!name || name === '_action' || control.disabled) return null;
  if (
    control instanceof HTMLInputElement &&
    ['submit', 'button', 'reset', 'image'].includes(control.type)
  ) {
    return null;
  }

  const prop: WebMcpJsonSchema = { type: 'string' };
  const description = control.getAttribute('toolparamdescription');
  if (description) prop.description = description;

  if (control instanceof HTMLInputElement) {
    if (control.type === 'number' || control.type === 'range') {
      prop.type = control.step === '1' ? 'integer' : 'number';
      if (control.min !== '' && !Number.isNaN(Number(control.min))) {
        prop.minimum = Number(control.min);
      }
      if (control.max !== '' && !Number.isNaN(Number(control.max))) {
        prop.maximum = Number(control.max);
      }
    } else if (control.type === 'checkbox') {
      prop.type = 'boolean';
    } else if (control.type === 'email') {
      prop.format = 'email';
    } else if (control.type === 'url') {
      prop.format = 'uri';
    } else if (control.type === 'date') {
      prop.format = 'date';
    }
    if (control.minLength >= 0) prop.minLength = control.minLength;
    if (control.maxLength >= 0) prop.maxLength = control.maxLength;
    if (control.pattern) prop.pattern = control.pattern;
    const dataEnum = control.getAttribute('data-enum');
    if (dataEnum) {
      prop.enum = dataEnum.split(',').filter(Boolean);
    }
  } else if (control instanceof HTMLTextAreaElement) {
    if (control.minLength >= 0) prop.minLength = control.minLength;
    if (control.maxLength >= 0) prop.maxLength = control.maxLength;
  } else if (control instanceof HTMLSelectElement) {
    const options = [...control.options].map((opt) => opt.value).filter((v) => v !== '');
    if (options.length) prop.enum = options;
  }

  return prop;
}

export function discoverDeclarativeForms(root?: ParentNode): WebMcpFormDescriptor[] {
  const scope = root ?? (typeof document !== 'undefined' ? document : undefined);
  if (!scope || typeof scope.querySelectorAll !== 'function') return [];
  const forms: WebMcpFormDescriptor[] = [];
  for (const form of scope.querySelectorAll('form[toolname]')) {
    if (!(form instanceof HTMLFormElement)) continue;
    const toolname = form.getAttribute('toolname')?.trim();
    if (!toolname) continue;
    const tooldescription = form.getAttribute('tooldescription')?.trim() ?? '';
    const properties: Record<string, WebMcpJsonSchema> = {};
    const required: string[] = [];

    for (const control of [...form.elements]) {
      const prop = formControlSchema(control);
      if (!prop) continue;
      const name = (control as HTMLInputElement).name;
      properties[name] = prop;
      if ((control as HTMLInputElement).required && !required.includes(name)) {
        required.push(name);
      }
    }

    const inputSchema: WebMcpJsonSchema = {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
    };

    forms.push({
      toolname,
      tooldescription,
      autosubmit: form.hasAttribute('toolautosubmit'),
      action: form.getAttribute('action') || form.action || '',
      method: (form.getAttribute('method') || form.method || 'get').toUpperCase(),
      inputSchema,
      form,
    });
  }
  return forms;
}

function populateFormInput(form: HTMLFormElement, input: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(input)) {
    const target = form.elements.namedItem(key);
    if (!target) continue;
    if (typeof RadioNodeList !== 'undefined' && target instanceof RadioNodeList) {
      const str = value == null ? '' : String(value);
      for (const node of [...target]) {
        if (node instanceof HTMLInputElement && (node.type === 'radio' || node.type === 'checkbox')) {
          node.checked = Array.isArray(value)
            ? value.map(String).includes(node.value)
            : node.value === str;
          node.dispatchEvent(new Event('input', { bubbles: true }));
          node.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      continue;
    }
    if (target instanceof HTMLInputElement) {
      if (target.type === 'checkbox') {
        target.checked = Boolean(value);
      } else {
        target.value = value == null ? '' : String(value);
      }
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      target.value = value == null ? '' : String(value);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

class DefaultWebMcpAdapter implements WebMcpAdapter {
  #tools = new Map<string, StoredTool>();

  #toNativeTool(stored: StoredTool): NativeModelContextTool {
    return {
      name: stored.name,
      description: stored.description,
      inputSchema: stored.inputSchema,
      ...(stored.annotations ? { annotations: stored.annotations } : {}),
      execute: async (input: Record<string, unknown>, client?: { signal?: AbortSignal }) => {
        const result = await this.#invokeStored(stored, input ?? {}, client?.signal);
        return formatNativeResult(result, globalConfig.resultFormat);
      },
    };
  }

  async #invokeStored(
    stored: StoredTool,
    rawInput: unknown,
    signal?: AbortSignal
  ): Promise<unknown> {
    const input = stored.schema ? await validateSchema(stored.schema, rawInput) : (rawInput ?? {});
    const context: WebMcpExecutionContext = {
      name: stored.name,
      signal: signal ?? stored.controller.signal,
      agentInvoked: true,
    };
    return await stored.execute(input, context);
  }

  #syncProvideContext(): void {
    const mc = getNativeModelContext();
    if (!mc || typeof mc.provideContext !== 'function' || typeof mc.registerTool === 'function') {
      return;
    }
    const tools = [...this.#tools.values()].map((stored) => this.#toNativeTool(stored));
    if (tools.length === 0 && typeof mc.clearContext === 'function') {
      mc.clearContext();
      return;
    }
    mc.provideContext({ tools });
  }

  register<TInput = Record<string, unknown>, TOutput = unknown>(
    tool: WebMcpToolDefinition<TInput, TOutput>
  ): () => void {
    if (!globalConfig.enabled) return () => {};
    if (this.#tools.has(tool.name)) {
      this.unregister(tool.name);
    }

    const normalized = defineWebMcpTool(tool);
    const controller = new AbortController();
    const stored: StoredTool = {
      name: normalized.name,
      description: normalized.description,
      inputSchema: normalized.inputSchema ?? { type: 'object', properties: {} },
      schema: normalized.schema as WebMcpToolDefinition['schema'],
      annotations: normalized.annotations,
      source: normalized.source,
      execute: (input, context) =>
        (normalized.execute as (i: unknown, c: WebMcpExecutionContext) => Promise<unknown> | unknown)(
          input,
          context
        ),
      controller,
    };

    this.#tools.set(stored.name, stored);

    const mc = getNativeModelContext();
    if (mc) {
      if (typeof mc.registerTool === 'function') {
        const maybeDisposer = mc.registerTool(this.#toNativeTool(stored), {
          signal: controller.signal,
        });
        if (typeof maybeDisposer === 'function') {
          stored.disposer = maybeDisposer;
        }
      } else if (typeof mc.provideContext === 'function') {
        this.#syncProvideContext();
      }
    }

    return () => {
      if (this.#tools.get(stored.name) === stored) {
        this.unregister(stored.name);
      }
    };
  }

  unregister(name: string): void {
    const stored = this.#tools.get(name);
    if (!stored) return;
    this.#tools.delete(name);
    stored.disposer?.();
    stored.controller.abort();

    const mc = getNativeModelContext();
    if (mc) {
      if (typeof mc.registerTool === 'function') {
        mc.unregisterTool?.(name);
      } else if (typeof mc.provideContext === 'function') {
        this.#syncProvideContext();
      }
    }
  }

  listTools(): WebMcpRegisteredTool[] {
    return [...this.#tools.values()].map((stored) => ({
      name: stored.name,
      description: stored.description,
      inputSchema: stored.inputSchema,
      ...(stored.annotations ? { annotations: stored.annotations } : {}),
      ...(stored.source ? { source: stored.source } : {}),
    }));
  }

  listForms(root?: ParentNode): WebMcpFormDescriptor[] {
    if (!globalConfig.enabled || !globalConfig.declarativeForms) return [];
    return discoverDeclarativeForms(root);
  }

  async executeTool(name: string, input: Record<string, unknown> = {}): Promise<unknown> {
    const stored = this.#tools.get(name);
    if (stored) {
      return await this.#invokeStored(stored, input);
    }

    const formDescriptor = this.listForms().find((entry) => entry.toolname === name);
    if (formDescriptor) {
      const form = formDescriptor.form;
      populateFormInput(form, input);

      let responded: Promise<unknown> | undefined;
      const submitter = form.querySelector<HTMLElement>(
        'button[type="submit"], input[type="submit"], button:not([type])'
      );
      let event: Event;
      try {
        event = new SubmitEvent('submit', {
          bubbles: true,
          cancelable: true,
          submitter,
        });
      } catch {
        event = new Event('submit', { bubbles: true, cancelable: true });
      }

      Object.defineProperty(event, 'agentInvoked', { value: true, configurable: true });
      Object.defineProperty(event, 'respondWith', {
        value: (response: unknown | Promise<unknown>) => {
          responded = Promise.resolve(response);
        },
        configurable: true,
      });

      const notCanceled = form.dispatchEvent(event);
      if (responded) {
        return await responded;
      }
      if (notCanceled) {
        return { ok: true, submitted: true, native: true };
      }
      return { ok: true, submitted: true };
    }

    throw new Error(`Lithono WebMCP: unknown tool "${name}"`);
  }

  configure(config: Partial<WebMcpGlobalConfig>): WebMcpGlobalConfig {
    globalConfig = { ...globalConfig, ...config };
    return getWebMcpConfig();
  }

  clear(): void {
    for (const name of [...this.#tools.keys()]) {
      this.unregister(name);
    }
  }
}

function ensurePolyfill(adapter: WebMcpAdapter): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!globalConfig.fallback || navigator.modelContext) return;
  const polyfill: NativeModelContext & { [LITHONO_POLYFILL]: true } = {
    [LITHONO_POLYFILL]: true,
    registerTool(tool, options) {
      const unregister = adapter.register({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        source: 'custom',
        execute: (input, ctx) => tool.execute(input, { signal: ctx.signal }),
      });
      options?.signal?.addEventListener('abort', unregister, { once: true });
      return unregister;
    },
    unregisterTool(name) {
      adapter.unregister(name);
    },
    provideContext(context) {
      adapter.clear();
      for (const tool of context.tools) {
        adapter.register({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          source: 'custom',
          execute: (input, ctx) => tool.execute(input, { signal: ctx.signal }),
        });
      }
    },
    clearContext() {
      adapter.clear();
    },
  };
  try {
    Object.defineProperty(navigator, 'modelContext', {
      value: polyfill,
      configurable: true,
      writable: true,
    });
  } catch {
    // Ignore environments with non-configurable navigator.
  }
}

function installBridge(adapter: WebMcpAdapter): void {
  if (typeof window === 'undefined') return;
  const bridge: WebMcpBridge = {
    get tools() {
      return getWebMcpAdapter().listTools();
    },
    get forms() {
      return getWebMcpAdapter().listForms();
    },
    executeTool(name, input) {
      return getWebMcpAdapter().executeTool(name, input);
    },
    setAdapter(custom) {
      setWebMcpAdapter(custom);
    },
    configure(config) {
      return configureWebMcp(config);
    },
  };
  window.__LITHONO_WEBMCP__ = bridge;
  ensurePolyfill(adapter);
}

export function getWebMcpConfig(): WebMcpGlobalConfig {
  return { ...globalConfig };
}

export function configureWebMcp(config: Partial<WebMcpGlobalConfig>): WebMcpGlobalConfig {
  return getWebMcpAdapter().configure(config);
}

export function getWebMcpAdapter(): WebMcpAdapter {
  if (!activeAdapter) {
    activeAdapter = new DefaultWebMcpAdapter();
  }
  installBridge(activeAdapter);
  return activeAdapter;
}

export function setWebMcpAdapter(adapter: WebMcpAdapter | undefined): void {
  activeAdapter = adapter;
  if (adapter) {
    installBridge(adapter);
  }
}
