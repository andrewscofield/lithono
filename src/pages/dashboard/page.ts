import { HttpError, post } from 'lithono';
import type { Loader } from 'lithono';
import { z } from 'zod';
import { requireWorkspace } from '../../server/workspace.ts';
import { sqlite } from '../../server/db.ts';
import { createProjectRepository, ProjectConflict } from '../../server/repositories/projects.ts';
import { dashboardQuery } from '../../lib/dashboard-query.ts';

export const meta = () => ({ title: 'Project dashboard · Lithono' });
export const hydrate = true;
export function loader(ctx: Loader) {
  const workspace = requireWorkspace(ctx);
  const repository = createProjectRepository(sqlite);
  repository.seed(workspace.id);
  const projects = repository.list(workspace.id);
  const query = dashboardQuery.read(ctx.url.searchParams);
  const id = query.project || projects[0]?.id;
  const snapshot = repository.snapshot(workspace.id, id, query.range);
  if (!snapshot) throw new HttpError(404, 'Project not found in this workspace');
  return { dashboard: { ...snapshot, projects, query: { ...query, project: id }, href: ctx.url.href } };
}
const projectInput = z.string().min(1).max(150);
export const actions = {
  changeStatus: post(z.object({ projectId: projectInput, milestoneId: z.string().min(1).max(200),
    status: z.enum(['planned', 'active', 'done']) }), ctx => {
    const workspace = requireWorkspace(ctx);
    if (!createProjectRepository(sqlite).status(workspace.id, ctx.input.projectId, ctx.input.milestoneId, ctx.input.status))
      throw new HttpError(404, 'Milestone not found in this workspace');
    return { saved: true };
  }),
  saveNotes: post(z.object({ projectId: projectInput, notes: z.string().max(4000, 'Notes must be at most 4000 characters'),
    version: z.coerce.number().int().min(1) }), ctx => {
    const workspace = requireWorkspace(ctx);
    try {
      const project = createProjectRepository(sqlite).saveNotes(workspace.id, ctx.input.projectId, ctx.input.notes, ctx.input.version);
      if (!project) throw new HttpError(404, 'Project not found in this workspace');
      return { projectId: project.id, notes: project.notes, version: project.notes_version };
    } catch (error) {
      if (error instanceof ProjectConflict) throw new HttpError(409, error.message);
      throw error;
    }
  }),
};
export type DashboardData = ReturnType<typeof loader>['dashboard'];
