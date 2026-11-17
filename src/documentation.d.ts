declare module 'virtual:lithono-docs' {
  export const articles: import('./lib/documentation.ts').DocArticle[];
  export const groups: import('./lib/documentation.ts').DocGroup[];
}
