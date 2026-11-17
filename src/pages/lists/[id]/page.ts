import { post, HttpError, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { taskIdSchema, taskTitleSchema } from '../../../lib/schemas/todo.ts';

export const meta = ({ data }: { data: Awaited<ReturnType<typeof loader>> }) => ({
  title: `${data.list.name} · Lists`,
});

export function loader({ db, params }: Loader) {
  const list = db.getList(params.id);
  if (!list) throw new HttpError(404, 'List not found');
  const tasks = db.listTasks(list.id).map((task) => ({
    ...task,
    href: `/lists/task/${task.id}`,
    statusLabel: task.completed ? 'Done' : 'Open',
    toggleLabel: task.completed ? 'Mark open' : 'Complete',
    cardClass: task.completed ? 'card task-card task-card--done' : 'card task-card',
  }));
  return {
    list,
    tasks,
    openCount: tasks.filter((task) => !task.completed).length,
    doneCount: tasks.filter((task) => task.completed).length,
  };
}

export const actions = {
  addTask: post(taskTitleSchema, async (ctx) => {
    const list = ctx.db.getList(ctx.params.id);
    if (!list) throw new HttpError(404, 'List not found');
    ctx.db.createTask(list.id, ctx.input.title);
    return { success: true };
  }),
  toggleTask: post(taskIdSchema, async (ctx) => {
    const task = ctx.db.toggleTask(ctx.params.id, ctx.input.taskId);
    if (!task) throw new HttpError(404, 'Task not found');
    return { success: true };
  }),
  deleteTask: post(taskIdSchema, async (ctx) => {
    const ok = ctx.db.deleteTask(ctx.params.id, ctx.input.taskId);
    if (!ok) throw new HttpError(404, 'Task not found');
    return { success: true };
  }),
  deleteList: post(async (ctx) => {
    const ok = ctx.db.deleteList(ctx.params.id);
    if (!ok) throw new HttpError(404, 'List not found');
    redirect('/lists');
  }),
};

export type PageActions = typeof actions;
