import { openDatabase } from './database.ts';

export interface Listing {
  id: string;
  address: string;
  price: number;
  kind: 'house' | 'apartment' | 'land';
  status: 'for-sale' | 'pending' | 'sold';
  featured: boolean;
  description?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  bedrooms?: number | null;
  area?: number | null;
  listed_at?: number;
  image?: string | null;
}

export interface TodoList {
  id: string;
  name: string;
  createdAt: number;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  completed: boolean;
  createdAt: number;
}

export interface TodoListSummary extends TodoList {
  taskCount: number;
  openCount: number;
}

// Compatibility facade for the existing simple demos and Better Auth.
// Future domain repositories import this connection and live in independent files.
export const sqlite = openDatabase();

function newId(): string {
  return crypto.randomUUID();
}

function asListing(row: unknown): Listing | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const record = row as Listing & { featured: number | boolean };
  return {
    ...record,
    featured: Boolean(record.featured),
  };
}

function asList(row: unknown): TodoList | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const record = row as { id: string; name: string; created_at: number };
  return { id: record.id, name: record.name, createdAt: record.created_at };
}

function asTask(row: unknown): Task | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const record = row as {
    id: string;
    list_id: string;
    title: string;
    completed: number | boolean;
    created_at: number;
  };
  return {
    id: record.id,
    listId: record.list_id,
    title: record.title,
    completed: Boolean(record.completed),
    createdAt: record.created_at,
  };
}

const listingSelect = 'SELECT id, address, price, kind, status, featured FROM listings';
const selectAllListings = sqlite.prepare(`${listingSelect} ORDER BY id`);
const selectOneListing = sqlite.prepare(`${listingSelect} WHERE id = ?`);
const updatePriceStmt = sqlite.prepare('UPDATE listings SET price = ? WHERE id = ?');
const deleteListingStmt = sqlite.prepare('DELETE FROM listings WHERE id = ?');
const insertListing = sqlite.prepare(
  'INSERT INTO listings (id, address, price, kind, status, featured) VALUES (?, ?, ?, ?, ?, ?)'
);

const selectLists = sqlite.prepare(`
  SELECT
    lists.id,
    lists.name,
    lists.created_at,
    COUNT(tasks.id) AS task_count,
    SUM(CASE WHEN tasks.id IS NOT NULL AND tasks.completed = 0 THEN 1 ELSE 0 END) AS open_count
  FROM lists
  LEFT JOIN tasks ON tasks.list_id = lists.id
  GROUP BY lists.id
  ORDER BY lists.created_at DESC
`);
const selectList = sqlite.prepare('SELECT id, name, created_at FROM lists WHERE id = ?');
const insertList = sqlite.prepare('INSERT INTO lists (id, name, created_at) VALUES (?, ?, ?)');
const deleteListStmt = sqlite.prepare('DELETE FROM lists WHERE id = ?');

const selectTasks = sqlite.prepare(`
  SELECT id, list_id, title, completed, created_at
  FROM tasks
  WHERE list_id = ?
  ORDER BY completed ASC, created_at DESC
`);
const selectTask = sqlite.prepare(
  'SELECT id, list_id, title, completed, created_at FROM tasks WHERE id = ? AND list_id = ?'
);
const selectTaskById = sqlite.prepare(
  'SELECT id, list_id, title, completed, created_at FROM tasks WHERE id = ?'
);
const insertTask = sqlite.prepare(
  'INSERT INTO tasks (id, list_id, title, completed, created_at) VALUES (?, ?, ?, 0, ?)'
);
const deleteTaskStmt = sqlite.prepare('DELETE FROM tasks WHERE id = ? AND list_id = ?');
const toggleTaskStmt = sqlite.prepare(
  'UPDATE tasks SET completed = CASE WHEN completed = 1 THEN 0 ELSE 1 END WHERE id = ? AND list_id = ?'
);

export const db = {
  listListings(): Listing[] {
    return selectAllListings
      .all()
      .map((row) => asListing(row))
      .filter((row): row is Listing => Boolean(row));
  },
  getListing(id: string): Listing | undefined {
    return asListing(selectOneListing.get(id));
  },
  updatePrice(id: string, price: number): Listing | undefined {
    updatePriceStmt.run(price, id);
    return this.getListing(id);
  },
  deleteListing(id: string): boolean {
    return deleteListingStmt.run(id).changes > 0;
  },
  createListing(input: {
    address: string;
    price: number;
    kind: Listing['kind'];
    status: Listing['status'];
    featured?: boolean;
  }): Listing {
    const id = String(Date.now());
    const featured = Boolean(input.featured);
    insertListing.run(id, input.address, input.price, input.kind, input.status, featured ? 1 : 0);
    return { id, ...input, featured };
  },

  listLists(): TodoListSummary[] {
    return selectLists.all().map((row) => {
      const record = row as {
        id: string;
        name: string;
        created_at: number;
        task_count: number;
        open_count: number;
      };
      return {
        id: record.id,
        name: record.name,
        createdAt: record.created_at,
        taskCount: Number(record.task_count),
        openCount: Number(record.open_count),
      };
    });
  },

  getList(id: string): TodoList | undefined {
    return asList(selectList.get(id));
  },

  createList(name: string): TodoList {
    const list: TodoList = { id: newId(), name, createdAt: Date.now() };
    insertList.run(list.id, list.name, list.createdAt);
    return list;
  },

  deleteList(id: string): boolean {
    return deleteListStmt.run(id).changes > 0;
  },

  listTasks(listId: string): Task[] {
    return selectTasks.all(listId).map(asTask).filter((task): task is Task => Boolean(task));
  },

  getTask(listId: string, taskId: string): Task | undefined {
    return asTask(selectTask.get(taskId, listId));
  },

  getTaskById(taskId: string): Task | undefined {
    return asTask(selectTaskById.get(taskId));
  },

  createTask(listId: string, title: string): Task {
    const task: Task = {
      id: newId(),
      listId,
      title,
      completed: false,
      createdAt: Date.now(),
    };
    insertTask.run(task.id, task.listId, task.title, task.createdAt);
    return task;
  },

  deleteTask(listId: string, taskId: string): boolean {
    return deleteTaskStmt.run(taskId, listId).changes > 0;
  },

  toggleTask(listId: string, taskId: string): Task | undefined {
    toggleTaskStmt.run(taskId, listId);
    return this.getTask(listId, taskId);
  },
};

export type Db = typeof db;

declare module 'lithono' {
  interface Locals {
    db: Db;
  }
}
