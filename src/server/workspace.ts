import { HttpError } from 'lithono';
import { requireUser } from 'lithono/auth';
import { sqlite } from './db.ts';
import { createWorkspaceRepository } from './repositories/workspaces.ts';
import { getProviderConfig } from './integrations/config.ts';

type AuthContext = Parameters<typeof requireUser>[0];
const workspaces = createWorkspaceRepository(sqlite);

/** Actions derive scope from auth, never from a hidden input or query parameter. */
export function requireWorkspace(ctx: AuthContext) {
  return workspaces.forUser(requireUser(ctx).id);
}

export function isEditor(
  user: { id: string; email: string; emailVerified?: unknown },
  policy = getProviderConfig(),
): boolean {
  // The demo supports signup without email verification. An email claim alone
  // must not grant editorial privileges; explicit account IDs remain usable.
  return policy.editorUserIds.includes(user.id)
    || (user.emailVerified === true && policy.editorEmails.includes(user.email.trim().toLowerCase()));
}

export function requireEditor(ctx: AuthContext) {
  const user = requireUser(ctx);
  if (!isEditor(user)) throw new HttpError(403, 'Editorial access required');
  return user;
}
