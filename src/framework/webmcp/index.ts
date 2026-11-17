export type {
  NativeModelContext,
  NativeModelContextTool,
  WebMcpAdapter,
  WebMcpAnnotations,
  WebMcpBridge,
  WebMcpExecutionContext,
  WebMcpFormDescriptor,
  WebMcpGlobalConfig,
  WebMcpJsonSchema,
  WebMcpPageConfig,
  WebMcpRegisteredTool,
  WebMcpToolConfig,
  WebMcpToolDefinition,
} from './types.ts';

export {
  configureWebMcp,
  defineWebMcpTool,
  discoverDeclarativeForms,
  getWebMcpAdapter,
  getWebMcpConfig,
  mcpForm,
  mcpParam,
  setWebMcpAdapter,
} from './adapter.ts';

export {
  WEBMCP_TOOLS_META,
  WebMcpController,
  collectDecoratedWebMcpTools,
  createUrlWebMcpTool,
  hasWebMcpDecoratorOwner,
  webmcpTool,
  type StoredWebMcpMethodMeta,
  type WebMcpControllerOptions,
  type WebMcpControllerTool,
  type WebMcpDecoratorOptions,
  type WebMcpUrlStateHandle,
  type WebMcpUrlToolOptions,
} from '../client/webmcp-controller.ts';
