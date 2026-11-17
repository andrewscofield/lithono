/** Wire format is identified by a response header, never by application keys. */
export const ACTION_PROTOCOL_HEADER = 'X-Lithono-Action-Protocol';
export const ACTION_PROTOCOL_VERSION = '1';

export interface ActionLoaderPayload {
  data?: unknown;
  layoutData?: unknown[];
  params?: Record<string, string>;
}

export type ActionRefresh =
  | { status: 'skipped' }
  | { status: 'success'; payload: ActionLoaderPayload }
  | { status: 'failed'; message: string };

export type ActionEnvelope =
  | {
      version: 1;
      ok: true;
      result: { kind: 'undefined' } | { kind: 'value'; value: unknown };
      meta: { refresh: ActionRefresh; redirect?: string };
    }
  | { version: 1; ok: false; error: { error: string; message: string; issues?: unknown } };

export function actionSuccess(
  value: unknown,
  refresh: ActionRefresh = { status: 'skipped' },
  redirect?: string
): ActionEnvelope {
  return {
    version: 1,
    ok: true,
    result: value === undefined ? { kind: 'undefined' } : { kind: 'value', value },
    meta: { refresh, ...(redirect === undefined ? {} : { redirect }) },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseActionEnvelope(value: unknown): ActionEnvelope {
  if (record(value) && value.version === 1) {
    if (value.ok === false && record(value.error) &&
        typeof value.error.error === 'string' && typeof value.error.message === 'string') {
      return value as ActionEnvelope;
    }
    if (value.ok === true && record(value.result) &&
        (value.result.kind === 'undefined' || (value.result.kind === 'value' && 'value' in value.result)) &&
        record(value.meta) && (value.meta.redirect === undefined || typeof value.meta.redirect === 'string') &&
        record(value.meta.refresh)) {
      const refresh = value.meta.refresh;
      if (refresh.status === 'skipped' ||
          (refresh.status === 'failed' && typeof refresh.message === 'string') ||
          (refresh.status === 'success' && record(refresh.payload) &&
            (refresh.payload.layoutData === undefined || Array.isArray(refresh.payload.layoutData)) &&
            (refresh.payload.params === undefined || (record(refresh.payload.params) &&
              Object.values(refresh.payload.params).every((param) => typeof param === 'string'))))) {
        return value as ActionEnvelope;
      }
    }
  }
  throw new Error('Invalid Lithono action protocol response');
}

export function actionEnvelopeResult(envelope: ActionEnvelope): unknown {
  if (!envelope.ok) throw new Error(envelope.error.message);
  return envelope.result.kind === 'undefined' ? undefined : envelope.result.value;
}
