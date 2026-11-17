/**
 * Page/layout form host: stamp schema constraints onto native controls, intercept
 * same-origin `?_action=` submits, and paint HTML5 / server issues.
 *
 * Does not wrap forms in a custom element. Does not run Zod in the browser — constraints
 * are derived on the server and shipped in `__LITHONO_DATA__`. Skip intercept when the
 * form has `data-lithono-native`, a browsing-context target, or another origin/path.
 */
import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { ActionRequestError, type ActionRequestOptions } from './action-proxy.ts';
import { getActionFields, getActionMeta, getActions, getLithonoData } from './data.ts';
import type { ActionMeta, FieldConstraints } from '../types.ts';
import type { StandardSchemaV1 } from '../standard-schema.ts';
import { getWebMcpConfig } from '../webmcp/adapter.ts';

type Host = ReactiveControllerHost & HTMLElement;
let nextErrorId = 0;

export type LithonoFormState = 'idle' | 'submitting' | 'success' | 'error';

export interface LithonoFormSuccessDetail {
  result: unknown;
  action: string;
  agentInvoked?: boolean;
}

export interface LithonoFormErrorDetail {
  message: string;
  issues?: unknown;
  status?: number;
  agentInvoked?: boolean;
}

export interface LithonoFormAgentResponse {
  ok: boolean;
  action: string;
  result?: unknown;
  error?: string;
  issues?: unknown;
  status?: number;
}

const DEFAULT_MESSAGES: Record<string, (input: HTMLInputElement) => string> = {
  required: () => 'This field is required',
  type: () => 'Enter a valid value',
  minlength: (input) => `Use at least ${input.minLength} characters`,
  maxlength: (input) => `Use at most ${input.maxLength} characters`,
  min: (input) => `Must be at least ${input.min}`,
  max: (input) => `Must be at most ${input.max}`,
  pattern: () => 'Enter a valid format',
  step: () => 'Enter a valid number',
  enum: (input) => `Must be one of: ${input.getAttribute('data-enum') ?? ''}`,
  match: () => 'Fields do not match',
};

function controlsOf(form: HTMLFormElement): HTMLInputElement[] {
  return [...form.elements].filter(
    (el): el is HTMLInputElement =>
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  ) as HTMLInputElement[];
}

/** Action name is `?_action=` on the form's `action` URL (from `actions.signIn.url`). */
function actionNameFromForm(form: HTMLFormElement, submitter?: HTMLElement | null): string | undefined {
  const attr = submitter?.getAttribute('formaction') ?? form.getAttribute('action') ?? form.action;
  if (!attr) return undefined;
  try {
    const url = new URL(attr, document.baseURI);
    return url.searchParams.get('_action') ?? undefined;
  } catch {
    return undefined;
  }
}

function stampConstraints(input: HTMLInputElement, constraints: FieldConstraints): void {
  const controlType = constraints.type;
  if (input instanceof HTMLInputElement && controlType && controlType !== 'select' && controlType !== 'radio' && !input.getAttribute('type')) {
    input.type = controlType;
  }
  // Required JSON boolean data does not mean a checkbox must be checked:
  // false is a valid value, and native unchecked controls are omitted. Keep an
  // explicitly authored required checkbox, but do not infer it from presence.
  if (constraints.required && input.type !== 'checkbox') input.required = true;
  if (constraints.min != null && input.min === '') input.min = String(constraints.min);
  if (constraints.max != null && input.max === '') input.max = String(constraints.max);
  if (constraints.minLength != null && input.minLength < 0) input.minLength = constraints.minLength;
  if (constraints.maxLength != null && input.maxLength < 0) input.maxLength = constraints.maxLength;
  if (constraints.pattern && !input.pattern) input.pattern = constraints.pattern;
  if (constraints.step != null && !input.step) input.step = String(constraints.step);
  if (constraints.enum?.length) input.setAttribute('data-enum', constraints.enum.join(','));
  if (constraints.description && !input.hasAttribute('toolparamdescription')) {
    input.setAttribute('toolparamdescription', constraints.description);
  }
}

function customMessage(input: HTMLInputElement, key: string): string | null {
  return input.getAttribute(`data-message-${key}`);
}

function shouldIntercept(form: HTMLFormElement, submitter?: HTMLElement | null): boolean {
  const target = submitter?.getAttribute('formtarget') ?? form.target;
  if (form.hasAttribute('data-lithono-native') || (target && target.toLowerCase() !== '_self')) return false;
  const method = submitter?.getAttribute('formmethod') ?? form.method;
  if (method.toLowerCase() === 'dialog') return false;
  if (!actionNameFromForm(form, submitter)) return false;
  try {
    const url = new URL(submitter?.getAttribute('formaction') ?? form.action, document.baseURI);
    return url.origin === window.location.origin && url.pathname === window.location.pathname;
  } catch {
    return false;
  }
}

function controlValue(el: Element | RadioNodeList | null): string {
  if (!el) return '';
  if (el instanceof RadioNodeList) {
    const picked = [...el].find((node) => node instanceof HTMLInputElement && node.checked);
    return picked instanceof HTMLInputElement ? picked.value : '';
  }
  return 'value' in el ? String((el as HTMLInputElement).value) : '';
}

/**
 * Intercepts native forms under a Lithono page or layout.
 * Multiple forms are distinguished by each form's `action` URL (`?_action=`).
 */
export class FormSubmitController implements ReactiveController {
  host: Host;
  #touched = new WeakSet<Element>();
  #pending = new WeakSet<HTMLFormElement>();
  #matchErrors = new WeakSet<Element>();

  constructor(host: Host) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {
    if (typeof window === 'undefined') return;
    this.host.addEventListener('submit', this.#onSubmit);
    this.host.addEventListener('focusout', this.#onFocusOut);
    this.host.addEventListener('input', this.#onInput);
    this.host.addEventListener('invalid', this.#onInvalid, true);
    this.host.addEventListener('reset', this.#onReset);
    this.#stampAll();
  }

  hostDisconnected(): void {
    this.host.removeEventListener('submit', this.#onSubmit);
    this.host.removeEventListener('focusout', this.#onFocusOut);
    this.host.removeEventListener('input', this.#onInput);
    this.host.removeEventListener('invalid', this.#onInvalid, true);
    this.host.removeEventListener('reset', this.#onReset);
  }

  hostUpdated(): void {
    if (typeof window === 'undefined') return;
    this.#stampAll();
  }

  #stampAll() {
    const webMcpConfig = getWebMcpConfig();
    const boot = getLithonoData();
    const pageMcp = boot.mcp;
    const formsGloballyEnabled =
      webMcpConfig.enabled &&
      webMcpConfig.declarativeForms &&
      pageMcp !== false &&
      (typeof pageMcp !== 'object' || (pageMcp.enabled !== false && pageMcp.forms !== false));

    interface StampFormCandidate {
      form: HTMLFormElement;
      actionName: string;
      actionMeta: ActionMeta | undefined;
      baseToolName: string;
    }

    const candidates: StampFormCandidate[] = [];
    const baseNameCounts = new Map<string, number>();
    const usedToolNames = new Set<string>();

    for (const form of this.host.querySelectorAll('form')) {
      if (!(form instanceof HTMLFormElement) || !shouldIntercept(form)) continue;
      const status = form.querySelector('[data-form-error]');
      status?.setAttribute('role', 'status');
      status?.setAttribute('aria-live', 'polite');
      const actionName = actionNameFromForm(form);
      const constraints = actionName ? getActionFields(actionName) : {};
      for (const input of controlsOf(form)) {
        if (!input.name) continue;
        const field = constraints[input.name];
        if (field) stampConstraints(input, field);
      }

      const authoredToolName = form.getAttribute('toolname');
      if (authoredToolName) usedToolNames.add(authoredToolName);

      if (!actionName || !formsGloballyEnabled || form.dataset.mcp === 'false') continue;
      const actionMeta = getActionMeta(actionName);
      const actionMcp = actionMeta?.mcp;
      if (actionMcp === false || (typeof actionMcp === 'object' && actionMcp.enabled === false)) {
        continue;
      }

      const configuredName = typeof actionMcp === 'object' ? actionMcp.name : undefined;
      const baseToolName =
        configuredName ?? (webMcpConfig.prefix ? `${webMcpConfig.prefix}${actionName}` : actionName);

      candidates.push({ form, actionName, actionMeta, baseToolName });
      if (!authoredToolName) {
        baseNameCounts.set(baseToolName, (baseNameCounts.get(baseToolName) ?? 0) + 1);
      }
    }

    const groupIndex = new Map<string, number>();
    for (const { form, actionName, actionMeta, baseToolName } of candidates) {
      const actionMcp = actionMeta?.mcp;
      const mcpObj = typeof actionMcp === 'object' ? actionMcp : undefined;

      if (!form.hasAttribute('toolname')) {
        const count = baseNameCounts.get(baseToolName) ?? 1;
        let toolName = baseToolName;
        if (count > 1 || usedToolNames.has(toolName)) {
          const idx = (groupIndex.get(baseToolName) ?? 0) + 1;
          groupIndex.set(baseToolName, idx);
          let keySuffix: string | undefined;
          for (const keyName of ['id', 'sku', 'key', 'slug']) {
            const el = form.elements.namedItem(keyName);
            if (el instanceof HTMLInputElement && el.type === 'hidden' && el.value.trim()) {
              keySuffix = el.value.trim();
              break;
            }
          }
          let candidate = keySuffix ? `${baseToolName}_${keySuffix}` : `${baseToolName}_${idx}`;
          let dedupe = idx;
          while (usedToolNames.has(candidate)) {
            dedupe += 1;
            candidate = `${baseToolName}_${dedupe}`;
          }
          toolName = candidate;
        }
        usedToolNames.add(toolName);
        form.setAttribute('toolname', toolName);
      }

      if (!form.hasAttribute('tooldescription')) {
        const description =
          mcpObj?.description ?? actionMeta?.description ?? `Submit ${actionName} form`;
        form.setAttribute('tooldescription', description);
      }

      if (!form.hasAttribute('toolautosubmit') && mcpObj?.autosubmit === true) {
        const hasPassword = controlsOf(form).some((control) => control.type === 'password');
        if (!hasPassword) {
          form.setAttribute('toolautosubmit', '');
        }
      }
    }
  }

  #onFocusOut = (event: Event) => {
    const input = event.target;
    if (!isControl(input) || !input.name || !this.host.contains(input)) return;
    const form = input.form;
    if (!form || !shouldIntercept(form)) return;
    const next = (event as FocusEvent).relatedTarget;
    // Revealing a hint on pointer-down can move the submit button before
    // pointer-up and swallow the click. Submission owns validation in this case.
    if ((next instanceof HTMLButtonElement && next.type === 'submit' && next.form === form)
        || (next instanceof HTMLInputElement && ['submit', 'image'].includes(next.type) && next.form === form)) return;
    this.#touched.add(input);
    this.#validateInput(form, input);
  };

  #onInput = (event: Event) => {
    const input = event.target;
    if (!(input instanceof HTMLElement) || !this.host.contains(input)) return;
    const form = (input as HTMLInputElement).form ?? input.closest('form');
    if (!form || !shouldIntercept(form) || !this.#touched.has(input)) return;
    if (isControl(input)) this.#validateInput(form, input);
    else if ([...form.elements].includes(input)) this.#paint(form, input);
  };

  #onSubmit = (event: Event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !this.host.contains(form)) return;
    const submitEvent = event as SubmitEvent;
    const submitter = submitEvent.submitter;
    if (event.defaultPrevented || !shouldIntercept(form, submitter)) return;
    const agentInvoked = Boolean(
      submitEvent.agentInvoked || typeof submitEvent.respondWith === 'function'
    );
    event.preventDefault();
    event.stopPropagation();
    if (this.#pending.has(form)) {
      if (agentInvoked && typeof submitEvent.respondWith === 'function') {
        submitEvent.respondWith(
          Promise.resolve({
            ok: false,
            action: actionNameFromForm(form, submitter) ?? '',
            error: 'Submission already in progress',
          } satisfies LithonoFormAgentResponse)
        );
      }
      return;
    }
    const promise = this.#submit(form, submitter, agentInvoked);
    if (agentInvoked && typeof submitEvent.respondWith === 'function') {
      submitEvent.respondWith(promise);
    } else {
      void promise;
    }
  };

  #onInvalid = (event: Event) => {
    const control = event.target;
    if (!(control instanceof HTMLElement)) return;
    const form = (control as HTMLInputElement).form ?? control.closest('form');
    if (!form || !shouldIntercept(form)) return;
    this.#touched.add(control);
    if (isControl(control)) this.#validateInput(form, control);
    else this.#paint(form, control, (control as HTMLInputElement).validationMessage || 'Enter a valid value');
    this.#setState(form, 'error');
    this.#setFormError(form, 'Please fix the highlighted fields');
  };

  #onReset = (event: Event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    queueMicrotask(() => {
      if (event.defaultPrevented) return;
      for (const control of [...form.elements]) {
        if (!(control instanceof HTMLElement)) continue;
        this.#touched.delete(control);
        if (this.#matchErrors.delete(control) && isControl(control)) control.setCustomValidity('');
        this.#paint(form, control);
      }
      this.#setFormError(form, '');
      if (!this.#pending.has(form)) this.#setState(form, 'idle');
    });
  };

  async #submit(
    form: HTMLFormElement,
    submitter: HTMLElement | null,
    agentInvoked = false
  ): Promise<LithonoFormAgentResponse> {
    const actionName = actionNameFromForm(form, submitter);
    if (!actionName) {
      return { ok: false, action: '', error: 'Missing action target' };
    }

    const confirmMessage = form.getAttribute('data-confirm') ?? form.getAttribute('confirm');
    if (
      confirmMessage &&
      !(agentInvoked && form.hasAttribute('toolautosubmit')) &&
      !window.confirm(confirmMessage)
    ) {
      return { ok: false, action: actionName, error: 'Action cancelled by user' };
    }

    if (!form.noValidate && !submitter?.hasAttribute('formnovalidate') && !this.#validateAll(form)) {
      this.#setState(form, 'error');
      this.host.dispatchEvent(
        new CustomEvent<LithonoFormErrorDetail>('lithono:error', {
          bubbles: true,
          composed: true,
          detail: {
            message: 'Please fix the highlighted fields',
            ...(agentInvoked ? { agentInvoked: true } : {}),
          },
        })
      );
      return { ok: false, action: actionName, error: 'Please fix the highlighted fields' };
    }

    this.#pending.add(form);
    this.#setState(form, 'submitting');
    this.#setFormError(form, '');

    try {
      const actions = getActions() as Record<
        string,
        (input: FormData, init?: ActionRequestOptions) => Promise<unknown>
      >;
      const init: ActionRequestOptions = {
        url: new URL(submitter?.getAttribute('formaction') ?? form.action, document.baseURI).href,
        method: submitter?.hasAttribute('formmethod') ? (submitter as HTMLButtonElement).formMethod : form.method,
        enctype: submitter?.hasAttribute('formenctype') ? (submitter as HTMLButtonElement).formEnctype : form.enctype,
      };
      if (form.getAttribute('data-revalidate') === 'false') {
        init.headers = { 'X-Lithono-Revalidate': '0' };
      }
      const action = actions[actionName];
      if (!Object.hasOwn(actions, actionName) || typeof action !== 'function') {
        throw new ActionRequestError(`Unknown action "${actionName}"`, 404);
      }
      const result = await action(new FormData(form, submitter), init);
      this.#setState(form, 'success');
      this.host.dispatchEvent(
        new CustomEvent<LithonoFormSuccessDetail>('lithono:success', {
          bubbles: true,
          composed: true,
          detail: {
            result,
            action: actionName,
            ...(agentInvoked ? { agentInvoked: true } : {}),
          },
        })
      );

      if (form.hasAttribute('data-reload')) {
        window.location.reload();
        return { ok: true, action: actionName, result };
      }
      if (form.hasAttribute('data-reset-on-success') || form.hasAttribute('reset-on-success')) {
        form.reset();
      }
      return { ok: true, action: actionName, result };
    } catch (error) {
      this.#setState(form, 'error');
      const failure = error instanceof ActionRequestError ? error : null;
      const issues = failure?.issues as readonly StandardSchemaV1.Issue[] | undefined;
      if (issues) this.#applyServerIssues(form, issues);
      const message = failure?.message ?? (error instanceof Error ? error.message : 'Request failed');
      this.#setFormError(form, message);
      this.host.dispatchEvent(
        new CustomEvent<LithonoFormErrorDetail>('lithono:error', {
          bubbles: true,
          composed: true,
          detail: {
            message,
            issues: failure?.issues,
            status: failure?.status,
            ...(agentInvoked ? { agentInvoked: true } : {}),
          },
        })
      );
      return {
        ok: false,
        action: actionName,
        error: message,
        issues: failure?.issues,
        status: failure?.status,
      };
    } finally {
      this.#pending.delete(form);
    }
  }

  #validateAll(form: HTMLFormElement): boolean {
    let ok = true;
    for (const control of [...form.elements]) {
      if (control instanceof HTMLElement && !isControl(control)) this.#paint(form, control);
    }
    for (const input of controlsOf(form)) {
      if (!input.willValidate) continue;
      this.#touched.add(input);
      if (!this.#validateInput(form, input)) ok = false;
    }
    if (!form.checkValidity()) ok = false;
    if (!ok) form.reportValidity();
    return ok;
  }

  #applyMatch(form: HTMLFormElement, input: HTMLInputElement): void {
    const otherName = input.getAttribute('data-match');
    if (!otherName) return;
    const expected = controlValue(form.elements.namedItem(otherName));
    if (input.value === expected) return;
    input.setCustomValidity(customMessage(input, 'match') ?? DEFAULT_MESSAGES.match(input));
    this.#matchErrors.add(input);
  }

  #validateInput(form: HTMLFormElement, input: HTMLInputElement): boolean {
    if (!input.willValidate) { this.#paint(form, input); return true; }
    if (this.#matchErrors.delete(input)) input.setCustomValidity('');
    if (!input.validity.customError) this.#applyMatch(form, input);
    const validity = input.validity;
    let message = '';
    if (validity.valueMissing) message = customMessage(input, 'required') ?? DEFAULT_MESSAGES.required(input);
    else if (validity.typeMismatch) message = customMessage(input, 'type') ?? DEFAULT_MESSAGES.type(input);
    else if (validity.tooShort) message = customMessage(input, 'minlength') ?? DEFAULT_MESSAGES.minlength(input);
    else if (validity.tooLong) message = customMessage(input, 'maxlength') ?? DEFAULT_MESSAGES.maxlength(input);
    else if (validity.rangeUnderflow) message = customMessage(input, 'min') ?? DEFAULT_MESSAGES.min(input);
    else if (validity.rangeOverflow) message = customMessage(input, 'max') ?? DEFAULT_MESSAGES.max(input);
    else if (validity.patternMismatch) message = customMessage(input, 'pattern') ?? DEFAULT_MESSAGES.pattern(input);
    else if (validity.stepMismatch) message = customMessage(input, 'step') ?? DEFAULT_MESSAGES.step(input);
    else if (validity.customError) message = input.validationMessage;
    this.#paint(form, input, message || undefined);
    return !message;
  }

  #applyServerIssues(form: HTMLFormElement, issues: readonly StandardSchemaV1.Issue[]) {
    const byName = new Map<string, string>();
    for (const issue of issues) {
      const last = issue.path?.at(0);
      const name =
        last == null
          ? undefined
          : typeof last === 'object' && 'key' in last
            ? String(last.key)
            : String(last);
      if (name && !byName.has(name)) byName.set(name, issue.message);
    }
    let first: HTMLElement | undefined;
    for (const input of [...form.elements]) {
      if (!(input instanceof HTMLElement)) continue;
      const name = input.getAttribute('name');
      if (!name || input.matches(':disabled')) continue;
      const message = byName.get(name);
      this.#paint(form, input, message);
      if (message) {
        this.#touched.add(input);
        if (input.tabIndex >= 0 || input.isContentEditable) first ??= input;
      }
    }
    first?.focus();
  }

  #paint(form: HTMLFormElement, input: HTMLElement, message?: string) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    const name = input.getAttribute('name');
    if (!name) return;
    const slot = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    if (slot) {
      const siblingInvalid = [...form.elements].some((control) => control !== input &&
        control.getAttribute('name') === name && control.getAttribute('aria-invalid') === 'true');
      const slotMessage = message ?? (siblingInvalid ? slot.textContent : '');
      setMessageText(slot, slotMessage ?? '');
      if (slot instanceof HTMLElement) slot.hidden = !slotMessage;
      if (!slot.id) {
        do { slot.id = `lithono-field-error-${++nextErrorId}`; }
        while (document.getElementById(slot.id) !== slot);
      }
      const described = new Set((input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
      if (message) described.add(slot.id);
      else described.delete(slot.id);
      if (described.size) input.setAttribute('aria-describedby', [...described].join(' '));
      else input.removeAttribute('aria-describedby');
    }
  }

  #setFormError(form: HTMLFormElement, message: string) {
    const slot = form.querySelector('[data-form-error]') ?? this.host.querySelector('[data-form-error]');
    if (slot) {
      slot.setAttribute('role', 'status');
      slot.setAttribute('aria-live', 'polite');
      setMessageText(slot, message);
      if (slot instanceof HTMLElement) slot.hidden = !message;
    }
  }

  #setState(form: HTMLFormElement, state: LithonoFormState) {
    form.setAttribute('data-state', state);
    form.toggleAttribute('aria-busy', state === 'submitting');
  }
}

/** Error slots may contain hydrated template boundaries. Replacing textContent
 * would remove those markers and break the page's next incremental update.
 * Update text leaves in place and retain all element/comment identities.
 */
function setMessageText(slot: Element, message: string): void {
  const walker = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
  let first: Node | null = walker.nextNode();
  if (first) {
    first.nodeValue = message;
    while ((first = walker.nextNode())) first.nodeValue = '';
  } else {
    const end = slot.lastChild?.nodeType === Node.COMMENT_NODE ? slot.lastChild : null;
    slot.insertBefore(document.createTextNode(message), end);
  }
}

function isControl(el: EventTarget | null): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  );
}
