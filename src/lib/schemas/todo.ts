import { z } from 'zod';

export const listNameSchema = z.object({
  name: z.string().trim().min(1, 'Give the list a name').max(80),
});

export const listIdSchema = z.object({
  listId: z.string().min(1),
});

export const taskTitleSchema = z.object({
  title: z.string().trim().min(1, 'Add a task').max(160),
});

export const taskIdSchema = z.object({
  taskId: z.string().min(1),
});
