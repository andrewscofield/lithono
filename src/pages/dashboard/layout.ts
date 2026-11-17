import type { Loader } from 'lithono';
import { requireWorkspace } from '../../server/workspace.ts';
import { sqlite } from '../../server/db.ts';
import { createProjectRepository } from '../../server/repositories/projects.ts';
import { dashboardHref } from '../../lib/dashboard-query.ts';

export function loader(ctx: Loader) {
  const workspace = requireWorkspace(ctx);
  const repository = createProjectRepository(sqlite);
  repository.seed(workspace.id);
  return { identity: { name: ctx.user!.name, email: ctx.user!.email },
    projects: repository.list(workspace.id).map(project => ({ ...project, href: dashboardHref(ctx.url, project.id) })) };
}
