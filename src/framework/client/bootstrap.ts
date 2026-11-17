import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import { elementModules } from 'virtual:lithono-elements';
import { attachContextRoot } from './context.ts';
import { getLithonoData } from './data.ts';
import { observeMappedElements } from './late-elements.ts';
import { startRouter } from './router.ts';
type BootHost = Element & { applyBootData?: () => void; updateComplete?: Promise<unknown> };

function boot() {
  attachContextRoot();

  const waiting = new WeakMap<Element, Promise<void>>();
  const loaded = new Set<string>();
  const observed = new WeakSet<Document | ShadowRoot>();
  function releaseHost(el: Element): Promise<void> {
    const existing = waiting.get(el);
    if (existing) return existing;
    const pending = (async () => {
      const data = getLithonoData();
      const scheduled = new Set(data.hydrationTags ?? [...(data.hydrate ? [data.pageTag] : []), ...data.layoutTags]);
      // A child's non-attribute properties are supplied by its owning template.
      // Release ancestors first; unrelated siblings still import independently.
      let parent = el.parentElement;
      while (parent) {
        if ((parent.hasAttribute('defer-hydration') || waiting.has(parent))
            && (scheduled.has(parent.localName) || customElements.get(parent.localName))) {
          await releaseHost(parent);
          break;
        }
        parent = parent.parentElement;
      }
      await customElements.whenDefined(el.localName);
      if (el.localName === data.pageTag || el.hasAttribute('data-lithono-layout-id')) {
        (el as BootHost).applyBootData?.();
      }
      el.removeAttribute('defer-hydration');
      await (el as BootHost).updateComplete;
      if (el.shadowRoot) release(el.shadowRoot);
    })();
    waiting.set(el, pending);
    return pending;
  }
  function release(root: Document | ShadowRoot) {
    if (!observed.has(root)) {
      observed.add(root);
      observeMappedElements(root, elementModules, loaded, () => release(document));
    }
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) release(el.shadowRoot);
      if (!el.hasAttribute('defer-hydration') || waiting.has(el)) continue;
      // Each definition owns its release. An unrelated failed or slow import
      // must not block it; undefined hosts keep their server fallback intact.
      void releaseHost(el).catch(error => console.error(`Lithono: failed to hydrate ${el.localName}`, error));
    }
  }
  return () => {
    release(document);
    for (const id of new Set(getLithonoData().elements)) {
      const load = elementModules[id];
      if (!load) {
        console.error(`Lithono: no client element loader for ${id}`);
        continue;
      }
      void Promise.resolve().then(load).then(() => release(document)).catch((error) => {
        console.error(`Lithono: failed to load client element module ${id}`, error);
      });
    }
  };
}

const enhance = boot();
enhance();
startRouter(enhance);
