import { Layout, Page } from './elements.ts';
import type { RequestContext } from '../../src/framework/types.ts';

async function revision(ctx: RequestContext) {
  const rev = Number(ctx.url.searchParams.get('rev') ?? 0);
  const delay = Number(ctx.url.searchParams.get('delay') ?? 0);
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  return rev;
}
export async function loadPageModules() {
  return {
    '/src/pages/layout.html': { default: Layout },
    '/src/pages/layout.ts': { loader: async (ctx: RequestContext) => ({ label: 'outer', revision: await revision(ctx) }) },
    '/src/pages/phase2/layout.html': { default: Layout },
    '/src/pages/phase2/layout.ts': { loader: async (ctx: RequestContext) => ({ label: 'inner', revision: await revision(ctx) }) },
    '/src/pages/phase2/[id]/page.html': { default: Page },
    '/src/pages/phase2/[id]/page.ts': {
      loader: async (ctx: RequestContext) => {
        const rev = await revision(ctx);
        return { revision: rev, items: rev % 2 ? ['b', 'a', 'c'] : ['a', 'b', 'c'] };
      },
      actions: {
        save: { method: 'POST', run: () => 'saved' },
        invalid: { method: 'POST', input: { '~standard': { version: 1, vendor: 'fixture', validate: () => ({ issues: [{ message: 'invalid', path: ['name'] }] }) } }, run: () => 'never' },
      },
    },
  };
}
export function loadElementModules() { return {}; }
