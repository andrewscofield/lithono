import type { Loader } from 'lithono';
import { requireUser } from 'lithono/auth';
import { catalog } from '@/server/services.ts';

export function loader(ctx: Loader) {
  const user = requireUser(ctx);
  catalog.seed(user.id);
  return { name: user.name, books: catalog.list(user.id) };
}
