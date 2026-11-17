import { tagFromModuleId } from '../element-id.ts';

const SKIP_STATICS = new Set(['length', 'name', 'prototype', 'arguments', 'caller']);

function assignDescriptors(from: object, to: object, skip: Set<string>): void {
  for (const key of Object.getOwnPropertyNames(from)) {
    if (skip.has(key)) continue;
    const desc = Object.getOwnPropertyDescriptor(from, key);
    if (!desc) continue;
    try {
      Object.defineProperty(to, key, desc);
    } catch {
      // Some runtime-owned fields (Lit internals) are not configurable.
    }
  }
}

/** Register, or copy render/statics onto the already-defined tag (SSR/HMR). */
export function redefineCustomElement(tag: string, ctor: CustomElementConstructor): void {
  if (!tag.includes('-')) {
    throw new Error(`Lithono: cannot define ${ctor.name}; tag must contain a hyphen`);
  }
  const existing = customElements.get(tag);
  if (!existing) {
    customElements.define(tag, ctor);
    return;
  }
  assignDescriptors(ctor.prototype, existing.prototype, new Set(['constructor']));
  assignDescriptors(ctor, existing, SKIP_STATICS);
}

export function defineFromFilename(tagOrUrl: string, ctor: CustomElementConstructor): void {
  const tag = tagOrUrl.includes('/') || tagOrUrl.includes('\\') ? tagFromModuleId(tagOrUrl) : tagOrUrl;
  redefineCustomElement(tag, ctor);
}
