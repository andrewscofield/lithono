import type { DatabaseSync } from 'node:sqlite';
import { seedOnce } from '../database/seeds.ts';
import { transaction } from '../database/migrations.ts';

export interface Project { id: string; name: string; notes: string; notes_version: number }
export interface Milestone { id: string; title: string; due: string; status: 'planned' | 'active' | 'done' }
export class ProjectConflict extends Error {}

export function createProjectRepository(database: DatabaseSync) {
  const get = (scope: string, id: string) => database.prepare(`SELECT id, name, notes, notes_version
    FROM dashboard_projects WHERE workspace_id = ? AND id = ?`).get(scope, id) as Project | undefined;
  const audit = (scope: string, id: string, message: string) => database.prepare(`INSERT INTO dashboard_activity
    (id, workspace_id, project_id, message, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), scope, id, message, Date.now());
  return {
    seed(scope: string) {
      seedOnce(database, 'dashboard', scope, 1, () => {
        for (const [index, name] of ['Harbor redesign', 'Field guide'].entries()) {
          const id = `${scope}:project:${index}`;
          database.prepare(`INSERT INTO dashboard_projects (id, workspace_id, name, notes) VALUES (?, ?, ?, ?)`)
            .run(id, scope, name, `Planning notes for ${name}.`);
          for (const [n, title] of ['Discovery', 'Prototype', 'Launch'].entries()) {
            database.prepare(`INSERT INTO dashboard_milestones (id, workspace_id, project_id, title, due, status)
              VALUES (?, ?, ?, ?, ?, ?)`).run(`${id}:milestone:${n}`, scope, id, title,
              `2026-10-${String(15 + n * 5).padStart(2, '0')}`, ['done', 'active', 'planned'][n]);
          }
          for (let day = 1; day <= 30; day++) {
            database.prepare(`INSERT INTO dashboard_metrics (workspace_id, project_id, day, completed) VALUES (?, ?, ?, ?)`)
              .run(scope, id, `2026-09-${String(day).padStart(2, '0')}`, (day * (index + 2)) % 11 + 2);
          }
          database.prepare(`INSERT INTO dashboard_activity (id, workspace_id, project_id, message, created_at)
            VALUES (?, ?, ?, ?, ?)`).run(`${id}:seed`, scope, id, 'Workspace project initialized', Date.UTC(2026, 8, 30));
        }
      });
    },
    list(scope: string) {
      return database.prepare('SELECT id, name FROM dashboard_projects WHERE workspace_id = ? ORDER BY name, id')
        .all(scope) as unknown as Pick<Project, 'id' | 'name'>[];
    },
    get,
    snapshot(scope: string, id: string, range: '7' | '30') {
      const project = get(scope, id);
      if (!project) return undefined;
      const milestones = database.prepare(`SELECT id, title, due, status FROM dashboard_milestones
        WHERE workspace_id = ? AND project_id = ? ORDER BY due, id`).all(scope, id) as unknown as Milestone[];
      const metrics = (database.prepare(`SELECT day, completed FROM dashboard_metrics
        WHERE workspace_id = ? AND project_id = ? ORDER BY day DESC LIMIT ?`).all(scope, id, Number(range)) as unknown as { day: string; completed: number }[]).reverse();
      const activity = database.prepare(`SELECT id, message, created_at FROM dashboard_activity
        WHERE workspace_id = ? AND project_id = ? ORDER BY created_at DESC, id DESC LIMIT 12`)
        .all(scope, id) as unknown as { id: string; message: string; created_at: number }[];
      return { project, milestones, metrics, activity, total: metrics.reduce((n, item) => n + item.completed, 0),
        done: milestones.filter(item => item.status === 'done').length };
    },
    status(scope: string, projectId: string, milestoneId: string, status: Milestone['status']) {
      return transaction(database, () => {
        if (!get(scope, projectId)) return false;
        const result = database.prepare(`UPDATE dashboard_milestones SET status = ?
          WHERE workspace_id = ? AND project_id = ? AND id = ? AND status != ?`)
          .run(status, scope, projectId, milestoneId, status);
        if (result.changes) audit(scope, projectId, `Milestone changed to ${status}`);
        return !!database.prepare(`SELECT id FROM dashboard_milestones WHERE workspace_id = ? AND project_id = ? AND id = ?`)
          .get(scope, projectId, milestoneId);
      });
    },
    saveNotes(scope: string, id: string, notes: string, version: number) {
      return transaction(database, () => {
        if (!get(scope, id)) return undefined;
        const result = database.prepare(`UPDATE dashboard_projects SET notes = ?, notes_version = notes_version + 1
          WHERE workspace_id = ? AND id = ? AND notes_version = ?`).run(notes, scope, id, version);
        if (!result.changes) throw new ProjectConflict('Notes changed on the server. Reload to compare before reapplying your draft.');
        audit(scope, id, 'Project notes saved');
        return get(scope, id);
      });
    },
  };
}
