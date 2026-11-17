declare module 'virtual:showcase-lab-compiler' {
  const compiled: { code: string; tagName: string; hydrate: boolean; childTags: string[]; hydrationReasons: string[] };
  export default compiled;
}
