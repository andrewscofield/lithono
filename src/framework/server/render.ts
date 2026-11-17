import { ElementRenderer, LitElementRenderer, render } from '@lit-labs/ssr';
import { collectResult } from '@lit-labs/ssr/lib/render-result.js';
import type { RenderInfo } from '@lit-labs/ssr';
import { LitElement } from 'lit';
import type { RootKind } from '../types.ts';
import { releaseSsrLightHost } from '../client/lit-ownership-compat.ts';

const CUSTOM_ELEMENT_TAG = /<([a-z][a-z0-9]*-[a-z0-9-]*)(?=[\s>/]|$)/g;
const DOCUMENT_FRAGMENT = 11;

// Lit's supported SSR lifecycle option wires context providers/consumers while
// suppressing asynchronous browser updates. Only framework hosts opt into it.
LitElementRenderer.renderOptions.push((element) => {
  const ctor = element.constructor as { root?: RootKind };
  if (ctor.root && typeof (element as { renderLight?: unknown }).renderLight === 'function') {
    return { connectedCallback: true };
  }
  return undefined;
});

type RenderRootKind = RootKind;

function renderRootKind(el: LitElement): RenderRootKind {
  const ctor = el.constructor as { root?: RenderRootKind };
  if (ctor.root === 'light' || ctor.root === 'host' || ctor.root === 'shadow') return ctor.root;
  const probe = el as LitElement & { createRenderRoot(): Node };
  if (typeof probe.createRenderRoot !== 'function') return 'shadow';
  let root: Node | undefined;
  try {
    root = probe.createRenderRoot();
  } catch {
    // Third-party Lit elements (Shadow DOM) may touch browser-only APIs here.
    return 'shadow';
  }
  if (root === el) return 'light';
  if (root && root.nodeType === DOCUMENT_FRAGMENT) return 'host';
  return 'shadow';
}

export class PlainElementRenderer extends ElementRenderer {
  static override matchesClass(ceClass: typeof HTMLElement) {
    return (
      Boolean(ceClass) &&
      !(ceClass.prototype instanceof LitElement) &&
      typeof (ceClass.prototype as { render?: unknown }).render === 'function'
    );
  }

  override renderShadow(renderInfo?: RenderInfo) {
    if (renderInfo) releaseSsrLightHost(renderInfo, this);
    return undefined;
  }

  override renderLight(_renderInfo?: RenderInfo) {
    const result = (this.element as { render?: () => unknown } | undefined)?.render?.();
    if (result == null) return [];
    if (typeof result === 'string') return [result];
    return [];
  }
}

export class LithonoElementRenderer extends LitElementRenderer {
  #rootKind?: RenderRootKind;

  private rootKind(): RenderRootKind {
    if (this.#rootKind) return this.#rootKind;
    const el = this.element as LitElement | undefined;
    this.#rootKind = el ? renderRootKind(el) : 'shadow';
    return this.#rootKind;
  }

  override renderShadow(renderInfo: RenderInfo) {
    // Returning any iterable — even an empty lit-part — makes Lit emit a
    // declarative shadow root. An empty shadow tree hides light-DOM children.
    if (this.rootKind() !== 'shadow') {
      releaseSsrLightHost(renderInfo, this);
      return undefined;
    }
    return super.renderShadow(renderInfo);
  }

  override renderLight(renderInfo: RenderInfo) {
    if (this.rootKind() === 'light') {
      return LitElementRenderer.prototype.renderShadow.call(this, renderInfo) ?? [];
    }
    // Third-party Lit elements do not implement `renderLight()`. The compiled template still has a
    // `renderLight()` child part inside them, so the output needs an empty part marker pair or every
    // later value in the template hydrates one slot off.
    if (this.rootKind() === 'shadow' || typeof (this.element as { renderLight?: unknown } | undefined)?.renderLight !== 'function') {
      return ['<!--lit-part--><!--/lit-part-->'];
    }
    return super.renderLight(renderInfo);
  }
}

export interface RenderedPage {
  chunks: string[];
  elements: string[];
}

function collectTags(html: string, into: Set<string>): void {
  CUSTOM_ELEMENT_TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CUSTOM_ELEMENT_TAG.exec(html))) {
    if (match[1]) into.add(match[1]);
  }
}

export async function renderPageTemplate(template: unknown): Promise<RenderedPage> {
  const elements = new Set<string>();
  const result = render(template, {
    deferHydration: true,
    elementRenderers: [PlainElementRenderer, LithonoElementRenderer],
    customElementRendered: (tag) => elements.add(tag),
  });

  const html = (await collectResult(result)).replace(
    /(<textarea\b[^>]*\bdata-lithono-textarea="([^"]*)"[^>]*>)(<\/textarea>)/g,
    (_match, open: string, text: string, close: string) => `${open}${text.startsWith('\n') ? '\n' : ''}${text}${close}`,
  );
  collectTags(html, elements);

  return { chunks: [html], elements: [...elements] };
}
