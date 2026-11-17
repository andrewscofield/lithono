import { noChange } from 'lit';
import { hydrate } from '@lit-labs/ssr-client';
import type { RenderOptions } from 'lit';
import type { ChildPart } from 'lit/directive.js';
import type { ElementRenderer, RenderInfo } from '@lit-labs/ssr';
import { Directive, directive, type DirectiveResult } from 'lit/directive.js';
import { getDirectiveClass } from 'lit/directive-helpers.js';
import { renderLight as labsRenderLight, isRenderLightDirective } from '@lit-labs/ssr-client/directives/render-light.js';

// Compatibility boundary: SSR recognizes the labs directive's inherited static
// identity. Use public directive helpers, never patch the labs prototype or Lit
// part internals. Verified with Lit 3.3.3, SSR 4.1.0, SSR client 1.1.8.
const LabsRenderLight = getDirectiveClass(labsRenderLight()) as typeof Directive;
let hiddenMarkers: Array<{ marker: Comment; text: string }> | undefined;
class OwnedRenderLight extends LabsRenderLight {
  override render() { return noChange; }
  override update(part: ChildPart) {
    if (hiddenMarkers) {
      // hydrate() supports noChange but still validates descendant lit-node
      // markers as if the opaque value were a TemplateResult. Hide only those
      // markers for this synchronous call. Child-part boundaries stay intact.
      const walker = document.createTreeWalker(part.parentNode, NodeFilter.SHOW_COMMENT);
      if (!part.startNode) return noChange;
      walker.currentNode = part.startNode;
      let depth = 1;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const marker = node as Comment;
        if (marker.data.startsWith('lit-part')) depth++;
        else if (marker.data.startsWith('/lit-part') && --depth === 0) break;
        else if (marker.data.startsWith('lit-node')) {
          hiddenMarkers.push({ marker, text: marker.data });
          marker.data = `lithono-opaque ${marker.data}`;
        }
      }
    }
    return noChange;
  }
}
export const renderLight: () => DirectiveResult = directive(OwnedRenderLight);
if (!isRenderLightDirective(renderLight())) {
  throw new Error('Lithono: unsupported Lit SSR render-light identity; see Phase2 migration notes');
}

export function hydrateOwned(value: unknown, container: HTMLElement | DocumentFragment, options: RenderOptions): void {
  // HTML parsing drops empty text nodes. Lit's primitive hydration path adopts
  // start.nextSibling as its text leaf, so an initially empty string would
  // otherwise adopt (and later overwrite) the closing comment itself.
  const emptyParts = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  let node: Node | null;
  while ((node = emptyParts.nextNode())) {
    if ((node as Comment).data === 'lit-part' && node.nextSibling?.nodeType === Node.COMMENT_NODE
        && (node.nextSibling as Comment).data === '/lit-part') {
      node.parentNode!.insertBefore(document.createTextNode(''), node.nextSibling);
    }
  }
  const previous = hiddenMarkers;
  const markers: NonNullable<typeof hiddenMarkers> = [];
  hiddenMarkers = markers;
  try { hydrate(value, container, options); }
  finally {
    for (const { marker, text } of markers) marker.data = text;
    hiddenMarkers = previous;
  }
}

/** Version-sensitive SSR stack convention: SSR pushes before renderShadow()
 * and only schedules a pop for an iterable shadow result. Light DOM needs the
 * push balanced immediately or context requests are shadow-retargeted.
 */
export function releaseSsrLightHost(info: RenderInfo, renderer: ElementRenderer): void {
  if (info.customElementHostStack.at(-1) !== renderer) {
    throw new Error('Lithono: unsupported Lit SSR host stack; see Phase2 migration notes');
  }
  info.customElementHostStack.pop();
}
