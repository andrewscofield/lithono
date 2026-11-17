import type { DatabaseSync } from 'node:sqlite';

export interface Workspace {
  id: string;
  ownerId: string;
}

export function createWorkspaceRepository(database: DatabaseSync) {
  return {
    forUser(userId: string): Workspace {
      if (!userId.trim()) throw new Error('Workspace requires an authenticated user id');
      // The shared auth user id is the stable personal workspace id.
      database.prepare(`INSERT INTO showcase_workspaces (id, owner_id, created_at)
        VALUES (?, ?, ?) ON CONFLICT (owner_id) DO NOTHING`).run(userId, userId, Date.now());
      return { id: userId, ownerId: userId };
    },
    assertOwner(workspaceId: string, userId: string): Workspace {
      const row = database.prepare('SELECT id FROM showcase_workspaces WHERE id = ? AND owner_id = ?')
        .get(workspaceId, userId) as { id: string } | undefined;
      if (!row) throw new Error('Workspace not found for this user');
      return { id: row.id, ownerId: userId };
    },
  };
}
