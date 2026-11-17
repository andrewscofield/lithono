import { createContext, ContextRoot } from '@lit/context';

export const pageDataContext = createContext<unknown>('lithono-page-data');
export const actionsContext = createContext<unknown>('lithono-actions');
export const paramsContext = createContext<Record<string, string>>('lithono-params');
export const sessionContext = createContext<unknown>('lithono-session');

let attached = false;

export function attachContextRoot(target: HTMLElement | Document = document.documentElement): ContextRoot {
  const root = new ContextRoot();
  root.attach(target as HTMLElement);
  attached = true;
  return root;
}

export function hasContextRoot(): boolean {
  return attached;
}
