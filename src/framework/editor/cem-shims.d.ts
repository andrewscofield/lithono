declare module '@custom-elements-manifest/analyzer/index.js' {
  export function create(options: {
    modules: unknown[];
    plugins?: unknown[];
    context?: Record<string, unknown>;
  }): unknown;
}

declare module '@custom-elements-manifest/analyzer/src/features/framework-plugins/lit/lit.js' {
  export function litPlugin(): unknown[];
}
