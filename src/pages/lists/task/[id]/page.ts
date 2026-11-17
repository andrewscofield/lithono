import { post, HttpError, redirect } from 'lithono';
import type { Loader } from 'lithono';

export const meta = ({ data }: { data: Awaited<ReturnType<typeof loader>> }) => ({
  title: `${data.task.title} · ${data.list.name}`,
});

export function loader({ db, params }: Loader) {
  const task = db.getTaskById(params.id);
  if (!task) throw new HttpError(404, 'Task not found');
  const list = db.getList(task.listId);
  if (!list) throw new HttpError(404, 'List not found');
  return {
    list,
    task: {
      ...task,
      statusLabel: task.completed ? 'Done' : 'Open',
      toggleLabel: task.completed ? 'Mark open' : 'Complete',
    },
    listHref: `/lists/${list.id}`,
  };
}

export const actions = {
  toggle: post(async (ctx) => {
    const current = ctx.db.getTaskById(ctx.params.id);
    if (!current) throw new HttpError(404, 'Task not found');
    const task = ctx.db.toggleTask(current.listId, current.id);
    if (!task) throw new HttpError(404, 'Task not found');
    return { success: true };
  }),
  delete: post(async (ctx) => {
    const current = ctx.db.getTaskById(ctx.params.id);
    if (!current) throw new HttpError(404, 'Task not found');
    const ok = ctx.db.deleteTask(current.listId, current.id);
    if (!ok) throw new HttpError(404, 'Task not found');
    redirect(`/lists/${current.listId}`);
  }),
};

export type PageActions = typeof actions;
