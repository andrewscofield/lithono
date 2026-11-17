import type { LithonoData } from '../types.ts';
import { applyRevalidate, beginStateRequest, getLithonoData, isStateRequestCurrent, setLithonoData } from './data.ts';

let navigateRoute: ((href: string, options?: { replace?: boolean; popstate?: boolean }) => Promise<void>) | undefined;
export function isRouterActive(): boolean { return navigateRoute !== undefined; }

/** Same-origin route transitions share the shell; external destinations use the browser. */
export async function navigate(href: string, options: { replace?: boolean; popstate?: boolean } = {}): Promise<void> {
  const url = new URL(href, window.location.href ?? window.location.origin);
  if (url.origin !== window.location.origin || !navigateRoute) {
    window.location[options.replace ? 'replace' : 'assign'](url.href);
    return;
  }
  await navigateRoute(url.href, options);
}

export function startRouter(enhance: () => void): void {
  let pending: AbortController | undefined;
  let generation = 0;
  const scrollPositions = new Map<string, [number, number]>();
  let committedHref = location.href;
  history.scrollRestoration = 'manual';
  const announce = () => window.dispatchEvent(new Event('lithono:url-change'));
  navigateRoute = async (href, options = {}) => {
    scrollPositions.set(committedHref, [window.scrollX, window.scrollY]);
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const request = ++generation;
    const previous = getLithonoData();
    const url = new URL(href);
    const samePage = url.pathname === previous.path && previous.hydrate;
    const stateRequest = beginStateRequest();
    document.documentElement.setAttribute('data-lithono-navigating', '');
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: samePage ? { Accept: 'application/json', 'X-Lithono-Revalidate': '1' } : { Accept: 'text/html' },
      });
      if (!response.ok) throw new Error(`Navigation failed (${response.status})`);
      if (request !== generation || !isStateRequestCurrent(stateRequest)) return;
      if (response.redirected && new URL(response.url).pathname !== url.pathname) {
        await navigate(response.url, options);
        return;
      }
      if (samePage && response.headers.get('Content-Type')?.includes('application/json')) {
        const payload = await response.json();
        if (request !== generation || !isStateRequestCurrent(stateRequest)) return;
        if (!options.popstate) history[options.replace ? 'replaceState' : 'pushState'](history.state, '', url);
        applyRevalidate({ ...payload, url: url.href }, stateRequest);
      } else {
        const next = new DOMParser().parseFromString(await response.text(), 'text/html');
        const script = next.getElementById('__LITHONO_DATA__');
        if (!script?.textContent) throw new Error('Destination is not a Lithono document');
        const data = JSON.parse(script.textContent) as LithonoData;
        const currentLayouts = [...document.querySelectorAll('[data-lithono-layout-id]')];
        const nextLayouts = [...next.querySelectorAll('[data-lithono-layout-id]')];
        let common = 0;
        while (common < currentLayouts.length && common < nextLayouts.length &&
          currentLayouts[common]!.getAttribute('data-lithono-layout-id') === nextLayouts[common]!.getAttribute('data-lithono-layout-id')) common++;
        const oldOutlet = currentLayouts[common] ?? document.querySelector(previous.pageTag);
        const newOutlet = nextLayouts[common] ?? next.querySelector(data.pageTag);
        if (!oldOutlet || !newOutlet) throw new Error('Missing route outlet');
        if (request !== generation || !isStateRequestCurrent(stateRequest)) return;
        const destination = new URL(response.url);
        destination.hash = url.hash;
        data.url = destination.href;
        data.path = destination.pathname;
        // Route CSS is additive: retained layouts and dependency imports keep their styles.
        for (const style of next.head.querySelectorAll('style, link[rel="stylesheet"]')) {
          const href = style.getAttribute('href');
          if (![...document.head.querySelectorAll('style, link[rel="stylesheet"]')].some(existing =>
            href ? existing.getAttribute('href') === href : existing.textContent === style.textContent)) {
            document.head.append(document.importNode(style, true));
          }
        }
        if (!options.popstate) history[options.replace ? 'replaceState' : 'pushState'](history.state, '', destination);
        setLithonoData(data);
        const fragment = document.createElement('template');
        // setHTMLUnsafe parses declarative shadow roots before custom elements upgrade.
        const container = document.createElement('div');
        if (typeof container.setHTMLUnsafe === 'function') container.setHTMLUnsafe(newOutlet.outerHTML);
        else {
          fragment.innerHTML = newOutlet.outerHTML;
          container.append(fragment.content);
          for (const template of container.querySelectorAll<HTMLTemplateElement>('template[shadowrootmode]')) {
            template.parentElement!.attachShadow({ mode: 'open' }).append(template.content);
            template.remove();
          }
        }
        oldOutlet.replaceWith(...container.childNodes);
        document.title = next.title;
        const description = next.head.querySelector('meta[name="description"]');
        document.head.querySelector('meta[name="description"]')?.remove();
        if (description) document.head.append(document.importNode(description, true));
        enhance();
        applyRevalidate(data);
      }
      announce();
      committedHref = location.href;
      document.getElementById('lithono-navigation-error')?.remove();
      document.dispatchEvent(new CustomEvent('lithono:navigation', { detail: { url: location.href } }));
      if (options.popstate) {
        const position = scrollPositions.get(location.href);
        if (position) requestAnimationFrame(() => { if (request === generation) window.scrollTo(...position); });
      }
      if (!options.popstate && !samePage) {
        const target = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : document.getElementById('main-content');
        target?.focus({ preventScroll: true });
        if (url.hash) target?.scrollIntoView();
        else window.scrollTo(0, 0);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        document.dispatchEvent(new CustomEvent('lithono:navigation-error', { detail: { error, href } }));
        let notice = document.getElementById('lithono-navigation-error');
        if (!notice) {
          notice = document.createElement('p');
          notice.id = 'lithono-navigation-error';
          notice.className = 'notice';
          notice.setAttribute('role', 'alert');
          document.body.append(notice);
        }
        notice.replaceChildren('Unable to load this page. ', Object.assign(document.createElement('a'), { href, textContent: 'Retry' }));
        notice.querySelector('a')!.setAttribute('data-lithono-native', '');
      }
    } finally {
      if (request === generation) {
        document.documentElement.removeAttribute('data-lithono-navigating');
        pending = undefined;
      }
    }
  };
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.composedPath().find(node => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
    if (!link || link.hasAttribute('download') || link.hasAttribute('data-lithono-native') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || url.searchParams.has('_action')) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    event.preventDefault();
    void navigate(url.href);
  });
  document.addEventListener('submit', event => {
    if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
    const form = event.target;
    const submitter = (event as SubmitEvent).submitter;
    const method = submitter?.getAttribute('formmethod') ?? form.method;
    const target = submitter?.getAttribute('formtarget') ?? form.target;
    if (method.toLowerCase() !== 'get' || form.hasAttribute('data-lithono-native') || (target && target !== '_self')) return;
    const url = new URL(submitter?.getAttribute('formaction') ?? form.action, location.href);
    if (url.origin !== location.origin || url.searchParams.has('_action')) return;
    url.search = '';
    for (const [key, value] of new FormData(form, submitter)) url.searchParams.append(key, typeof value === 'string' ? value : value.name);
    event.preventDefault();
    void navigate(url.href);
  });
  window.addEventListener('popstate', () => { void navigate(location.href, { popstate: true }); });
}
