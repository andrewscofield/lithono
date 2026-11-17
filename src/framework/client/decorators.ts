import { consume } from '@lit/context';
import { actionsContext, pageDataContext, paramsContext, sessionContext } from './context.ts';

export const pageData = () => consume({ context: pageDataContext, subscribe: true });
export const actions = () => consume({ context: actionsContext, subscribe: true });
export const params = () => consume({ context: paramsContext, subscribe: true });
export const session = () => consume({ context: sessionContext, subscribe: true });
