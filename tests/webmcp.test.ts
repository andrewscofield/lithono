import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { z } from 'zod';
import {
  deriveFields,
  deriveInputSchema,
  deriveSchemaDescription,
  inputSchemaFromFields,
  setJsonSchemaProvider,
} from '../src/framework/fields.ts';
import { destroy, get, post } from '../src/framework/define.ts';
import { toActionDescriptors, toActionMeta } from '../src/framework/server/actions.ts';
import { defineQuery, query } from '../src/framework/url.ts';
import { compileComponentRender } from '../src/framework/compiler/html.ts';
import {
  SchemaValidationError,
  type StandardSchemaV1,
} from '../src/framework/standard-schema.ts';
import {
  WebMcpController,
  configureWebMcp,
  createUrlWebMcpTool,
  defineWebMcpTool,
  getWebMcpAdapter,
  mcpForm,
  mcpParam,
  setWebMcpAdapter,
  webmcpTool,
} from '../src/framework/webmcp/index.ts';
import { createUrlState, type UrlEnvironment } from '../src/framework/client/url-state.ts';
import { UrlController } from '../src/framework/client/controllers.ts';
import { FormSubmitController } from '../src/framework/client/form-host.ts';
import { setLithonoData } from '../src/framework/client/data.ts';
import type { ActionDefinition, LithonoData } from '../src/framework/types.ts';
import type { NativeModelContextTool } from '../src/framework/webmcp/types.ts';

afterEach(() => {
  setJsonSchemaProvider(undefined);
  getWebMcpAdapter().clear();
  setWebMcpAdapter(undefined);
  configureWebMcp({
    enabled: true,
    fallback: true,
    prefix: '',
    declarativeForms: true,
    autoActions: true,
    resultFormat: 'auto',
  });
});

test('fields & schema helpers derive field descriptions, full JSON Schema, and field fallback', () => {
  const schema = z
    .object({
      sku: z.string().min(2).max(20).describe('Inventory SKU identifier'),
      quantity: z.number().int().min(0).max(500).describe('Available stock quantity'),
      notes: z.string().optional().describe('Optional adjustment note'),
    })
    .describe('Update stock levels');

  const fields = deriveFields(schema);
  assert.equal(fields.sku?.description, 'Inventory SKU identifier');
  assert.equal(fields.quantity?.description, 'Available stock quantity');
  assert.equal(fields.notes?.description, 'Optional adjustment note');
  assert.equal(fields.sku?.required, true);
  assert.equal(fields.notes?.required, false);

  assert.equal(deriveSchemaDescription(schema), 'Update stock levels');

  const jsonSchema = deriveInputSchema(schema);
  assert.ok(jsonSchema);
  assert.equal('$schema' in jsonSchema, false);
  assert.equal(jsonSchema.type, 'object');
  assert.equal(jsonSchema.description, 'Update stock levels');
  assert.equal(jsonSchema.properties?.sku?.description, 'Inventory SKU identifier');
  assert.equal(jsonSchema.properties?.quantity?.type, 'integer');
  assert.deepEqual(jsonSchema.required, ['sku', 'quantity']);

  // Fallback when custom validator produces no JSON Schema natively
  const customSchema: StandardSchemaV1<{ count: number }, { count: number }> = {
    '~standard': {
      version: 1,
      vendor: 'custom',
      validate: (value) => ({ value: value as { count: number } }),
    },
  };
  setJsonSchemaProvider(() => null);
  assert.equal(deriveSchemaDescription(customSchema), undefined);
  const fallback = deriveInputSchema(customSchema);
  assert.deepEqual(fallback, { type: 'object', properties: {} });

  const fromFields = inputSchemaFromFields({
    email: { type: 'email', required: true, description: 'User email' },
    count: { type: 'number', step: 1, min: 1, max: 10 },
    role: { type: 'select', enum: ['admin', 'member'] },
    active: { type: 'checkbox' },
  });
  assert.equal(fromFields.properties?.email?.format, 'email');
  assert.equal(fromFields.properties?.email?.description, 'User email');
  assert.equal(fromFields.properties?.count?.type, 'integer');
  assert.deepEqual(fromFields.properties?.role?.enum, ['admin', 'member']);
  assert.equal(fromFields.properties?.active?.type, 'boolean');
  assert.deepEqual(fromFields.required, ['email']);
});

test('defineAction chaining (.mcp, .describe) and server toActionMeta/toActionDescriptors enforce defaults & opt-outs', () => {
  const loginSchema = z.object({
    email: z.string().email().describe('Account email'),
    password: z.string().min(8).describe('Account password'),
  });

  const actions = {
    search: get(
      z.object({ q: z.string().describe('Search term') }).describe('Search catalog'),
      ({ input }) => input
    ),
    adjust: post(
      z.object({ id: z.string() }),
      ({ input }) => input
    )
      .describe('Adjust stock')
      .mcp({ name: 'adjust_stock', autosubmit: true, annotations: { idempotentHint: true } }),
    remove: destroy(
      z.object({ id: z.string() }),
      ({ input }) => input,
      { description: 'Delete record' }
    ),
    signIn: post(loginSchema, ({ input }) => input).mcp({ autosubmit: true }),
    hidden: post(z.object({ x: z.string() }), ({ input }) => input).mcp(false),
  } as unknown as Record<string, ActionDefinition<never, unknown>>;

  const meta = toActionMeta(actions, { prefix: 'app_' });
  assert.equal(meta.search.description, 'Search catalog');
  assert.deepEqual(
    typeof meta.search.mcp === 'object' ? meta.search.mcp.annotations : undefined,
    { readOnlyHint: true }
  );
  assert.equal(typeof meta.search.mcp === 'object' ? meta.search.mcp.name : undefined, 'app_search');

  assert.equal(typeof meta.adjust.mcp === 'object' ? meta.adjust.mcp.name : undefined, 'adjust_stock');
  assert.equal(meta.adjust.description, 'Adjust stock');
  assert.equal(typeof meta.adjust.mcp === 'object' ? meta.adjust.mcp.autosubmit : undefined, true);
  assert.deepEqual(
    typeof meta.adjust.mcp === 'object' ? meta.adjust.mcp.annotations : undefined,
    { idempotentHint: true }
  );

  assert.equal(meta.remove.description, 'Delete record');
  assert.deepEqual(
    typeof meta.remove.mcp === 'object' ? meta.remove.mcp.annotations : undefined,
    { destructiveHint: true }
  );

  // Password field forces consequentialHint and blocks autosubmit
  assert.equal(typeof meta.signIn.mcp === 'object' ? meta.signIn.mcp.autosubmit : undefined, false);
  assert.deepEqual(
    typeof meta.signIn.mcp === 'object' ? meta.signIn.mcp.annotations : undefined,
    { consequentialHint: true }
  );

  assert.equal(meta.hidden.mcp, false);

  const pageOptOut = toActionMeta(actions, false);
  assert.equal(pageOptOut.search.mcp, false);
  assert.equal(pageOptOut.adjust.mcp, false);

  const descriptors = toActionDescriptors('/inventory', actions);
  assert.equal(descriptors.adjust.description, 'Adjust stock');
  assert.ok(descriptors.adjust.inputSchema?.properties?.id);
});

test('defineQuery().toJsonSchema() emits typed WebMCP schemas with descriptions & constraints', () => {
  const filterQuery = defineQuery(
    {
      q: query.string({ description: 'Search query' }),
      page: query.integer({ default: 1, min: 1, max: 100, description: 'Page index' }),
      sort: query.enum(['asc', 'desc'], { default: 'asc', description: 'Sort direction' }),
      inStock: query.boolean({ default: false, description: 'Only in-stock items' }),
      tags: query.array(query.string(), { default: [], description: 'Filter tags' }),
    },
    { description: 'Catalog query filters' }
  );

  const schema = filterQuery.toJsonSchema();
  assert.equal(schema.type, 'object');
  assert.equal(schema.description, 'Catalog query filters');
  assert.deepEqual(schema.properties?.q, {
    type: 'string',
    default: '',
    description: 'Search query',
  });
  assert.deepEqual(schema.properties?.page, {
    type: 'integer',
    default: 1,
    minimum: 1,
    maximum: 100,
    description: 'Page index',
  });
  assert.deepEqual(schema.properties?.sort, {
    type: 'string',
    enum: ['asc', 'desc'],
    default: 'asc',
    description: 'Sort direction',
  });
  assert.deepEqual(schema.properties?.inStock, {
    type: 'boolean',
    default: false,
    description: 'Only in-stock items',
  });
  assert.deepEqual(schema.properties?.tags, {
    type: 'array',
    items: { type: 'string', default: '' },
    default: [],
    description: 'Filter tags',
  });
});

test('HTML compiler compiles toolautosubmit as a Lit boolean binding and preserves WebMCP attributes', () => {
  const compiled = compileComponentRender(
    '/tmp/mcp-form-card.html',
    `<form toolname="save_note" tooldescription="Save a note" toolautosubmit="\${this.auto}">
      <input name="note" toolparamdescription="Note text">
    </form>`
  );
  assert.match(compiled.renderMethod, /\?toolautosubmit=\$\{this\.auto\}/);
  assert.match(compiled.renderMethod, /toolname="save_note"/);
  assert.match(compiled.renderMethod, /tooldescription="Save a note"/);
  assert.match(compiled.renderMethod, /toolparamdescription="Note text"/);
});

test('WebMcpAdapter supports Standard Schema validation, native registerTool, provideContext fallback, and polyfill bridge', async () => {
  const adapter = getWebMcpAdapter();
  const tool = defineWebMcpTool({
    name: 'double_value',
    description: 'Double a positive integer',
    schema: z.object({ value: z.number().int().positive() }),
    execute: async ({ value }, ctx) => {
      assert.equal(ctx.agentInvoked, true);
      return { doubled: value * 2 };
    },
  });

  assert.equal(tool.inputSchema?.type, 'object');
  assert.equal(tool.inputSchema?.properties?.value?.type, 'integer');

  const registeredCalls: NativeModelContextTool[] = [];
  const unregisteredNames: string[] = [];
  let aborted = false;

  const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const prevWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const fakeWindow: Record<string, unknown> = {};
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      modelContext: {
        registerTool(nativeTool: NativeModelContextTool, options?: { signal?: AbortSignal }) {
          registeredCalls.push(nativeTool);
          options?.signal?.addEventListener('abort', () => {
            aborted = true;
          });
        },
        unregisterTool(name: string) {
          unregisteredNames.push(name);
        },
      },
    },
    configurable: true,
    writable: true,
  });

  try {
    setWebMcpAdapter(adapter);
    const dispose = adapter.register(tool);
    assert.equal(adapter.listTools().length, 1);
    assert.equal(registeredCalls.length, 1);

    // Bridge executes raw object result
    const direct = await (fakeWindow.__LITHONO_WEBMCP__ as { executeTool: (n: string, i: object) => Promise<unknown> }).executeTool(
      'double_value',
      { value: 7 }
    );
    assert.deepEqual(direct, { doubled: 14 });

    // Native browser callback formats result as JSON string under resultFormat: 'auto'
    const nativeResult = await registeredCalls[0].execute({ value: 5 });
    assert.equal(nativeResult, '{"doubled":10}');

    // Standard Schema validation failure
    await assert.rejects(
      () => adapter.executeTool('double_value', { value: -3 }),
      (error) => error instanceof SchemaValidationError
    );

    dispose();
    assert.equal(adapter.listTools().length, 0);
    assert.equal(aborted, true);
    assert.deepEqual(unregisteredNames, ['double_value']);

    // Bulk provideContext / clearContext fallback mode
    const snapshots: string[][] = [];
    let cleared = 0;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        modelContext: {
          provideContext(ctx: { tools: NativeModelContextTool[] }) {
            snapshots.push(ctx.tools.map((t) => t.name));
          },
          clearContext() {
            cleared += 1;
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const d2 = adapter.register(tool);
    assert.deepEqual(snapshots, [['double_value']]);
    d2();
    assert.equal(cleared, 1);

    // Automatic polyfill installation when navigator.modelContext is absent
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    const active = getWebMcpAdapter();
    assert.ok((globalThis.navigator as Navigator).modelContext?.registerTool);
    const nativeDispose = (globalThis.navigator as Navigator).modelContext!.registerTool!({
      name: 'ping',
      description: 'Ping',
      execute: () => ({ pong: true }),
    });
    assert.equal(active.listTools().map((t) => t.name).includes('ping'), true);
    (nativeDispose as (() => void) | undefined)?.();
    assert.equal(active.listTools().map((t) => t.name).includes('ping'), false);
  } finally {
    if (prevNavigator) Object.defineProperty(globalThis, 'navigator', prevNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
    if (prevWindow) Object.defineProperty(globalThis, 'window', prevWindow);
    else delete (globalThis as { window?: unknown }).window;
  }
});

test('WebMcpController and @webmcpTool support instance scoping, dynamic registration, and disconnect cleanup', async () => {
  const controllers: Array<{ hostConnected(): void; hostDisconnected(): void }> = [];
  class FakeWidget {
    prefix = 'hello';
    #controller: WebMcpController;

    constructor(id: string) {
      this.#controller = new WebMcpController(this as never, { scope: id });
    }

    addController(controller: { hostConnected(): void; hostDisconnected(): void }) {
      controllers.push(controller);
    }
    removeController() {}
    requestUpdate() {}
    get updateComplete() {
      return Promise.resolve(true);
    }

    @webmcpTool({
      name: 'greet',
      description: 'Greet caller using widget prefix',
      schema: z.object({ who: z.string() }),
      annotations: { readOnlyHint: true },
    })
    greet({ who }: { who: string }) {
      return { message: `${this.prefix}, ${who}` };
    }

    registerExtra() {
      return this.#controller.register(
        defineWebMcpTool({
          name: 'status',
          description: 'Read widget status',
          execute: () => ({ prefix: this.prefix }),
        })
      );
    }
  }

  const widget = new FakeWidget('card-1');
  const removeExtra = widget.registerExtra();
  assert.equal(getWebMcpAdapter().listTools().length, 0);

  for (const c of controllers) c.hostConnected();
  const names = getWebMcpAdapter().listTools().map((t) => t.name).sort();
  assert.deepEqual(names, ['greet_card-1', 'status_card-1']);

  const greetOut = await getWebMcpAdapter().executeTool('greet_card-1', { who: 'Ada' });
  assert.deepEqual(greetOut, { message: 'hello, Ada' });

  removeExtra();
  assert.deepEqual(
    getWebMcpAdapter().listTools().map((t) => t.name),
    ['greet_card-1']
  );

  for (const c of controllers) c.hostDisconnected();
  assert.equal(getWebMcpAdapter().listTools().length, 0);
});

test('createUrlState and UrlController register read-only WebMCP tools and support null resets', async () => {
  let href = 'https://app.test/listings?q=loft&page=2';
  const pushed: string[] = [];
  const listeners = new Map<string, Set<EventListener>>();

  const env: UrlEnvironment = {
    location: {
      get href() {
        return href;
      },
      assign(url: string) {
        href = url;
      },
      replace(url: string) {
        href = url;
      },
    },
    history: {
      state: null,
      pushState(_d: unknown, _u: string, url: string) {
        href = url;
        pushed.push(url);
      },
      replaceState(_d: unknown, _u: string, url: string) {
        href = url;
      },
    },
    addEventListener(type, listener) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };

  const def = defineQuery({
    q: query.string({ description: 'Search text' }),
    page: query.integer({ default: 1, min: 1, description: 'Page number' }),
  });

  const revalidated: string[] = [];
  const state = createUrlState(def, {
    environment: env,
    mcp: { name: 'filter_listings', description: 'Filter property listings' },
    revalidate: (ctx) => {
      revalidated.push(ctx.href);
    },
  });

  state.start();
  const registered = getWebMcpAdapter().listTools();
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, 'filter_listings');
  assert.deepEqual(registered[0].annotations, { readOnlyHint: true, idempotentHint: true });

  // Empty object reads without history push or revalidate
  const readOnlySnapshot = await getWebMcpAdapter().executeTool('filter_listings', {});
  assert.deepEqual({ ...(readOnlySnapshot as { values: Record<string, unknown> }).values }, { q: 'loft', page: 2 });
  assert.equal(pushed.length, 0);
  assert.equal(revalidated.length, 0);

  // Patching updates URL and resets null keys to defaults
  const updated = await getWebMcpAdapter().executeTool('filter_listings', {
    q: null,
    page: 3,
  });
  assert.deepEqual({ ...(updated as { values: Record<string, unknown> }).values }, { q: '', page: 3 });
  assert.equal(href, 'https://app.test/listings?page=3');
  assert.equal(pushed.length, 1);
  assert.equal(revalidated.length, 1);

  state.dispose();
  assert.equal(getWebMcpAdapter().listTools().length, 0);

  // Direct createUrlWebMcpTool + UrlController lifecycle
  const hostControllers: Array<{ hostConnected(): void; hostDisconnected(): void }> = [];
  const fakeHost = {
    addController(c: { hostConnected(): void; hostDisconnected(): void }) {
      hostControllers.push(c);
    },
    removeController() {},
    requestUpdate() {},
    get updateComplete() {
      return Promise.resolve(true);
    },
  };
  const ctrl = new UrlController(fakeHost, def, {
    environment: env,
    mcp: { name: 'ctrl_filter', description: 'Controller filter', effect: 'local' },
  });
  ctrl.hostConnected();
  assert.deepEqual(
    getWebMcpAdapter().listTools().map((t) => t.name),
    ['ctrl_filter']
  );
  await getWebMcpAdapter().executeTool('ctrl_filter', { q: 'studio' });
  assert.equal(ctrl.value.q, 'studio');
  ctrl.dispose();
  assert.equal(getWebMcpAdapter().listTools().length, 0);

  const manualTool = createUrlWebMcpTool(state, def, { name: 'manual_url_tool' });
  assert.equal(manualTool.inputSchema?.properties?.q?.description, 'Search text');
});

test('mcpForm/mcpParam helpers return expected declarative attributes and FormSubmitController stamps & responds', async () => {
  assert.deepEqual(mcpForm({ name: 'save', description: 'Save item', autosubmit: true }), {
    toolname: 'save',
    tooldescription: 'Save item',
    toolautosubmit: '',
  });
  assert.deepEqual(mcpParam('Target quantity'), {
    toolparamdescription: 'Target quantity',
  });

  // Save globals to restore cleanly
  const savedGlobals = new Map<string, PropertyDescriptor | undefined>();
  const setGlobal = (key: string, value: unknown) => {
    if (!savedGlobals.has(key)) savedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };

  class FakeElement {
    attrs = new Map<string, string>();
    dataset: Record<string, string> = {};
    listeners = new Map<string, Set<EventListener>>();
    hidden = false;
    getAttribute(name: string) {
      return this.attrs.has(name) ? this.attrs.get(name)! : null;
    }
    setAttribute(name: string, value: string) {
      this.attrs.set(name, String(value));
    }
    removeAttribute(name: string) {
      this.attrs.delete(name);
    }
    hasAttribute(name: string) {
      return this.attrs.has(name);
    }
    toggleAttribute(name: string, force?: boolean) {
      const next = force ?? !this.attrs.has(name);
      if (next) this.attrs.set(name, '');
      else this.attrs.delete(name);
      return next;
    }
    addEventListener(type: string, fn: EventListener) {
      let set = this.listeners.get(type);
      if (!set) {
        set = new Set();
        this.listeners.set(type, set);
      }
      set.add(fn);
    }
    removeEventListener(type: string, fn: EventListener) {
      this.listeners.get(type)?.delete(fn);
    }
    dispatchEvent(event: Event) {
      for (const fn of this.listeners.get(event.type) ?? []) {
        fn(event);
      }
      return !event.defaultPrevented;
    }
    closest() {
      return null;
    }
    querySelector(): FakeElement | null {
      return null;
    }
  }

  class FakeInput extends FakeElement {
    name: string;
    type: string;
    value: string;
    required = false;
    min = '';
    max = '';
    minLength = -1;
    maxLength = -1;
    pattern = '';
    step = '';
    willValidate = true;
    validationMessage = '';
    validity = {
      valid: true,
      customError: false,
      valueMissing: false,
      typeMismatch: false,
      tooShort: false,
      tooLong: false,
      rangeUnderflow: false,
      rangeOverflow: false,
      patternMismatch: false,
      stepMismatch: false,
    };
    form: FakeForm | null = null;
    constructor(name: string, type = 'text', value = '') {
      super();
      this.name = name;
      this.type = type;
      this.value = value;
      if (type !== 'text') this.setAttribute('type', type);
    }
    setCustomValidity() {}
    checkValidity() {
      return true;
    }
    reportValidity() {
      return true;
    }
  }

  class FakeTextArea extends FakeElement {
    name = '';
    value = '';
    willValidate = true;
    validationMessage = '';
    validity = { valid: true, customError: false };
  }
  class FakeSelect extends FakeElement {
    name = '';
    value = '';
    options: Array<{ value: string }> = [];
    willValidate = true;
    validationMessage = '';
    validity = { valid: true, customError: false };
  }

  class FakeForm extends FakeElement {
    action: string;
    method = 'post';
    enctype = 'application/x-www-form-urlencoded';
    target = '';
    noValidate = false;
    controls: FakeInput[] = [];
    host?: FakeHost;
    constructor(action: string, controls: FakeInput[]) {
      super();
      this.action = action;
      this.setAttribute('action', action);
      this.controls = controls;
      for (const control of controls) control.form = this;
    }
    get elements() {
      const list = [...this.controls] as FakeInput[] & {
        namedItem(name: string): FakeInput | null;
      };
      list.namedItem = (name: string) => this.controls.find((c) => c.name === name) ?? null;
      return list;
    }
    checkValidity() {
      return true;
    }
    reportValidity() {
      return true;
    }
    reset() {}
    override dispatchEvent(event: Event) {
      Object.defineProperty(event, 'target', { value: this, configurable: true });
      super.dispatchEvent(event);
      if (event.bubbles !== false && this.host) {
        this.host.dispatchEvent(event);
      }
      return !event.defaultPrevented;
    }
  }

  class FakeHost extends FakeElement {
    forms: FakeForm[] = [];
    dispatchedEvents: CustomEvent[] = [];
    addController() {}
    removeController() {}
    requestUpdate() {}
    get updateComplete() {
      return Promise.resolve(true);
    }
    contains(node: unknown) {
      return this.forms.includes(node as FakeForm) || this.forms.some((f) => f.controls.includes(node as FakeInput));
    }
    querySelectorAll(selector: string) {
      return selector === 'form' ? this.forms : [];
    }
    override dispatchEvent(event: Event) {
      if (event instanceof CustomEvent) this.dispatchedEvents.push(event);
      return super.dispatchEvent(event);
    }
  }

  class FakeFormData {
    entries: Array<[string, string]> = [];
    constructor(form?: FakeForm) {
      if (form) {
        for (const c of form.controls) this.entries.push([c.name, c.value]);
      }
    }
    append(k: string, v: string) {
      this.entries.push([k, v]);
    }
    forEach(cb: (value: string, key: string) => void) {
      for (const [k, v] of this.entries) cb(v, k);
    }
    *[Symbol.iterator](): IterableIterator<[string, string]> {
      yield* this.entries;
    }
  }

  let confirmCalled = false;
  let fetchCalled = false;
  const scriptEl = { textContent: '' };

  setGlobal('HTMLElement', FakeElement);
  setGlobal('HTMLInputElement', FakeInput);
  setGlobal('HTMLTextAreaElement', FakeTextArea);
  setGlobal('HTMLSelectElement', FakeSelect);
  setGlobal('HTMLFormElement', FakeForm);
  setGlobal('FormData', FakeFormData);
  setGlobal('document', {
    baseURI: 'http://lithono.local/inventory',
    getElementById: (id: string) => (id === '__LITHONO_DATA__' ? scriptEl : null),
    querySelector: () => null,
  });
  setGlobal('window', {
    location: { origin: 'http://lithono.local', pathname: '/inventory', href: 'http://lithono.local/inventory' },
    confirm: () => {
      confirmCalled = true;
      return false;
    },
  });
  setGlobal('navigator', {});
  setGlobal('fetch', async () => {
    fetchCalled = true;
    return new Response(
      JSON.stringify({
        version: 1,
        ok: true,
        result: { kind: 'value', value: { saved: true, sku: 'sku-1' } },
        meta: { refresh: { status: 'skipped' } },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Lithono-Action-Protocol': '1',
        },
      }
    );
  });

  try {
    const boot: LithonoData = {
      route: '/inventory',
      path: '/inventory',
      url: 'http://lithono.local/inventory',
      params: {},
      data: {},
      layoutData: [],
      actions: {
        adjust: {
          method: 'POST',
          description: 'Adjust stock level',
          mcp: { description: 'Adjust item inventory', autosubmit: true },
          fields: {
            id: { required: true, type: 'text', description: 'Row identifier' },
            stock: { required: true, type: 'number', step: 1, min: 0, description: 'New stock count' },
          },
        },
        secret: {
          method: 'POST',
          mcp: false,
          fields: { token: { required: true, type: 'text', description: 'Secret' } },
        },
      },
      elements: [],
      pageTag: 'page-inventory',
      layoutTags: [],
      hydrate: true,
    };
    setLithonoData(boot);

    const form1 = new FakeForm('http://lithono.local/inventory?_action=adjust', [
      new FakeInput('id', 'hidden', 'sku-1'),
      new FakeInput('stock', '', '15'),
    ]);
    form1.setAttribute('confirm', 'Are you sure?');
    const form2 = new FakeForm('http://lithono.local/inventory?_action=adjust', [
      new FakeInput('id', 'hidden', 'sku-2'),
      new FakeInput('stock', '', '25'),
    ]);
    const optOutForm = new FakeForm('http://lithono.local/inventory?_action=secret', [
      new FakeInput('token', 'text', 'abc'),
    ]);

    const host = new FakeHost();
    for (const form of [form1, form2, optOutForm]) {
      form.host = host;
      host.forms.push(form);
    }

    const controller = new FormSubmitController(host as never);
    controller.hostConnected();

    // Disambiguated declarative attributes stamped automatically
    assert.equal(form1.getAttribute('toolname'), 'adjust_sku-1');
    assert.equal(form2.getAttribute('toolname'), 'adjust_sku-2');
    assert.equal(form1.getAttribute('tooldescription'), 'Adjust item inventory');
    assert.equal(form1.hasAttribute('toolautosubmit'), true);
    assert.equal(form1.controls[1].getAttribute('toolparamdescription'), 'New stock count');

    // Action with mcp: false is not stamped as a WebMCP form
    assert.equal(optOutForm.getAttribute('toolname'), null);

    // Simulate WebMCP agent submit with agentInvoked + respondWith
    let responsePromise: Promise<unknown> | undefined;
    const event = new Event('submit', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'submitter', { value: null });
    Object.defineProperty(event, 'agentInvoked', { value: true });
    Object.defineProperty(event, 'respondWith', {
      value: (promise: Promise<unknown>) => {
        responsePromise = Promise.resolve(promise);
      },
    });

    form1.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.ok(responsePromise);

    const agentResponse = await responsePromise;
    assert.equal(fetchCalled, true);
    assert.equal(confirmCalled, false);
    assert.deepEqual(agentResponse, {
      ok: true,
      action: 'adjust',
      result: { saved: true, sku: 'sku-1' },
    });
    assert.equal(host.dispatchedEvents.at(-1)?.type, 'lithono:success');
    assert.equal(
      (host.dispatchedEvents.at(-1)?.detail as { agentInvoked?: boolean }).agentInvoked,
      true
    );

    controller.hostDisconnected();
  } finally {
    for (const [key, desc] of savedGlobals) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
});
