import { post, HttpError, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { listIdSchema, listNameSchema } from '../../lib/schemas/todo.ts';

export const meta = () => ({
  title: 'Lists · Lithono',
  description: 'Keep a few lists. Open one, tick things off, share a single task.',
});

export function loader({ db }: Loader) {
  return { lists: db.listLists() };
}

export const actions = {
  createList: post(listNameSchema, async (ctx) => {
    const list = ctx.db.createList(ctx.input.name);
    redirect(`/lists/${list.id}`);
  }),
  deleteList: post(listIdSchema, async (ctx) => {
    const ok = ctx.db.deleteList(ctx.input.listId);
    if (!ok) throw new HttpError(404, 'List not found');
    redirect('/lists');
  }),
};

export type PageActions = typeof actions;
