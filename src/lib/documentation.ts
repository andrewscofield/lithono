export interface DocHeading { id: string; title: string; depth: number }
export interface DocArticle {
  id: string;
  title: string;
  description: string;
  section: string;
  html: string;
  markdown: string;
  search: string;
  headings: DocHeading[];
}
export interface DocGroup { title: string; articles: Pick<DocArticle, 'id' | 'title' | 'description'>[] }
