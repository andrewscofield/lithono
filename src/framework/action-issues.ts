import type { StandardSchemaV1 } from './standard-schema.ts';

/** Browser-safe display helpers. Schema inspection/validation stays on server. */
export function issueForField(
  issues: readonly StandardSchemaV1.Issue[] | undefined,
  name: string,
): string | undefined {
  if (!issues) return undefined;
  for (const issue of issues) {
    if (issuePathKey(issue) === name) return issue.message;
  }
  return undefined;
}

export function issuePathKey(issue: StandardSchemaV1.Issue): string | undefined {
  const last = issue.path?.at(-1);
  if (last == null) return undefined;
  if (typeof last === 'object' && 'key' in last) return String(last.key);
  return String(last);
}
