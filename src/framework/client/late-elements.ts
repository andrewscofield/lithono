export type MappedLoader = (() => Promise<unknown>) & { tag?: string };

/** Only explicitly mapped tags are candidates; merely importing the catalogue is lazy. */
export function observeMappedElements(
  root: Document | ShadowRoot,
  modules: Record<string, MappedLoader>,
  loaded: Set<string>,
  afterLoad: () => void,
): () => void {
  const byTag = new Map(Object.entries(modules).filter(([, load]) => load.tag).map(([id, load]) => [load.tag!, { id, load }]));
  const scanTag = (element: Element) => {
    const entry = byTag.get(element.localName);
    if (entry && !loaded.has(entry.id) && !customElements.get(element.localName)) {
      loaded.add(entry.id);
      void Promise.resolve().then(entry.load).then(afterLoad)
        .catch(error => console.error(`Lithono: failed to load mapped element ${element.localName}`, error));
    }
  };
  const scan = (element: Element) => {
    scanTag(element);
    for (const child of element.querySelectorAll('*')) scanTag(child);
  };
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) scan(node);
  });
  observer.observe(root, { childList: true, subtree: true });
  for (const element of root.querySelectorAll('*')) scanTag(element);
  return () => observer.disconnect();
}
