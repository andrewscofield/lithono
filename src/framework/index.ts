export { html, nothing } from 'lit';
export { unsafeHTML } from 'lit/directives/unsafe-html.js';
export { renderLight } from './client/render-light.ts';

export type {
  ActionDefinition,
  ActionDescriptor,
  ActionFailure,
  ActionMeta,
  ActionRunContext,
  ActionFailureContext,
  ActionView,
  ErrorModule,
  FieldConstraints,
  FieldInputType,
  HttpMethod,
  InferActionClient,
  InferActionInput,
  InlinePolicy,
  LayoutModule,
  LithonoData,
  LithonoPlugin,
  Loader,
  Locals,
  MiddlewareModule,
  PageMeta,
  PageModule,
  RequestContext,
  RootKind,
  SchemaOptions,
  WebMcpJsonSchema,
  WebMcpPageConfig,
  WebMcpToolConfig,
} from './types.ts';

export type {
  WebMcpAdapter,
  WebMcpAnnotations,
  WebMcpBridge,
  WebMcpExecutionContext,
  WebMcpFormDescriptor,
  WebMcpGlobalConfig,
  WebMcpRegisteredTool,
  WebMcpToolDefinition,
} from './webmcp/types.ts';

export {
  configureWebMcp,
  defineWebMcpTool,
  getWebMcpAdapter,
  getWebMcpConfig,
  mcpForm,
  mcpParam,
  setWebMcpAdapter,
} from './webmcp/adapter.ts';

export {
  defineAction,
  defineDeleteAction,
  defineGetAction,
  definePatchAction,
  definePostAction,
  definePutAction,
  destroy,
  get,
  HttpError,
  LITHONO_ACTION,
  patch,
  post,
  put,
  redirect,
} from './define.ts';

export type { ActionHelperOptions, DefinedAction } from './define.ts';

export {
  SchemaValidationError,
  validateSchema,
} from './standard-schema.ts';
export type { StandardSchemaV1 } from './standard-schema.ts';
