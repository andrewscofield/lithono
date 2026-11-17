import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/server/database.ts';
import { createWorkspaceRepository } from '../../src/server/repositories/workspaces.ts';
import { createProjectRepository, ProjectConflict } from '../../src/server/repositories/projects.ts';
import { authNext } from '../../src/lib/auth-next.ts';
import { dashboardQuery } from '../../src/lib/dashboard-query.ts';

test('dashboard seed, snapshots, mutations and audit stay within the workspace; notes detect conflicts', () => {
  const db = openDatabase(':memory:');
  try {
    const workspaces = createWorkspaceRepository(db);
    const a = workspaces.forUser('alice');
    const b = workspaces.forUser('bob');
    const repo = createProjectRepository(db);
    repo.seed(a.id); repo.seed(a.id); repo.seed(b.id);
    assert.equal(repo.list(a.id).length, 2);
    const project = repo.list(a.id)[0];
    const snapshot = repo.snapshot(a.id, project.id, '7')!;
    assert.equal(snapshot.metrics.length, 7);
    assert.equal(repo.snapshot(a.id, project.id, '30')!.metrics.length, 30);
    assert.equal(repo.snapshot(b.id, project.id, '7'), undefined);
    assert.equal(repo.status(b.id, project.id, snapshot.milestones[0].id, 'active'), false);
    assert.equal(repo.saveNotes(b.id, project.id, 'intrusion', 1), undefined);
    assert.equal(repo.status(a.id, project.id, snapshot.milestones[0].id, 'active'), true);
    assert.equal(repo.snapshot(a.id, project.id, '7')!.activity.length, 2);
    assert.equal(repo.status(a.id, project.id, snapshot.milestones[0].id, 'active'), true);
    assert.equal(repo.snapshot(a.id, project.id, '7')!.activity.length, 2);
    assert.equal(repo.saveNotes(a.id, project.id, 'A durable note', 1)!.notes_version, 2);
    assert.throws(() => repo.saveNotes(a.id, project.id, 'stale', 1), ProjectConflict);
    assert.equal(repo.get(a.id, project.id)!.notes, 'A durable note');
    assert.equal(repo.snapshot(a.id, project.id, '7')!.activity.length, 3);
  } finally { db.close(); }
});

test('auth return paths reject external, protocol-relative and backslash redirects; dashboard codec is strict', () => {
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/\nevil', 'dashboard', null]) {
    assert.equal(authNext(value), '/listings');
  }
  assert.equal(authNext('/dashboard?range=30&project=a'), '/dashboard?range=30&project=a');
  assert.deepEqual({ ...dashboardQuery.read(new URLSearchParams('range=bogus')) }, { project: '', range: '7' });
});
