import type { StandardSchemaV1 } from '../standard-schema.ts';

export interface WebMcpJsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, WebMcpJsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: WebMcpJsonSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  default?: unknown;
  additionalProperties?: boolean | WebMcpJsonSchema;
  [key: string]: unknown;
}

export interface WebMcpAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  consequentialHint?: boolean;
  untrustedContentHint?: boolean;
  [key: string]: unknown;
}

export type WebMcpToolConfig =
  | boolean
  | {
      name?: string;
      description?: string;
      annotations?: WebMcpAnnotations;
      autosubmit?: boolean;
      enabled?: boolean;
    };

export type WebMcpPageConfig =
  | boolean
  | {
      enabled?: boolean;
      prefix?: string;
      actions?: boolean | Record<string, WebMcpToolConfig>;
      forms?: boolean;
    };

export interface WebMcpGlobalConfig {
  enabled?: boolean;
  fallback?: boolean;
  prefix?: string;
  declarativeForms?: boolean;
  autoActions?: boolean;
  resultFormat?: 'auto' | 'json-string' | 'mcp-content' | 'raw';
}

export interface WebMcpExecutionContext {
  name: string;
  signal?: AbortSignal;
  agentInvoked: true;
}

export interface WebMcpToolDefinition<
  TInput = Record<string, unknown>,
  TOutput = unknown,
> {
  name: string;
  description: string;
  inputSchema?: WebMcpJsonSchema;
  schema?: StandardSchemaV1<unknown, TInput>;
  annotations?: WebMcpAnnotations;
  source?: 'page-action' | 'component' | 'url-state' | 'custom';
  execute: (input: TInput, context: WebMcpExecutionContext) => Promise<TOutput> | TOutput;
}

export interface WebMcpRegisteredTool {
  name: string;
  description: string;
  inputSchema: WebMcpJsonSchema;
  annotations?: WebMcpAnnotations;
  source?: 'page-action' | 'component' | 'url-state' | 'custom';
}

export interface WebMcpFormDescriptor {
  toolname: string;
  tooldescription: string;
  autosubmit: boolean;
  action: string;
  method: string;
  inputSchema: WebMcpJsonSchema;
  form: HTMLFormElement;
}

export interface NativeModelContextTool {
  name: string;
  description: string;
  inputSchema?: WebMcpJsonSchema;
  annotations?: WebMcpAnnotations;
  execute: (
    input: Record<string, unknown>,
    client?: { signal?: AbortSignal }
  ) => Promise<unknown> | unknown;
}

export interface NativeModelContext {
  registerTool?(
    tool: NativeModelContextTool,
    options?: { signal?: AbortSignal }
  ): void | (() => void);
  unregisterTool?(name: string): void;
  provideContext?(context: { tools: NativeModelContextTool[] }): void;
  clearContext?(): void;
}

export interface WebMcpAdapter {
  register<TInput = Record<string, unknown>, TOutput = unknown>(
    tool: WebMcpToolDefinition<TInput, TOutput>
  ): () => void;
  unregister(name: string): void;
  listTools(): WebMcpRegisteredTool[];
  listForms(root?: ParentNode): WebMcpFormDescriptor[];
  executeTool(name: string, input?: Record<string, unknown>): Promise<unknown>;
  configure(config: Partial<WebMcpGlobalConfig>): WebMcpGlobalConfig;
  clear(): void;
}

export interface WebMcpBridge {
  readonly tools: WebMcpRegisteredTool[];
  readonly forms: WebMcpFormDescriptor[];
  executeTool(name: string, input?: Record<string, unknown>): Promise<unknown>;
  setAdapter(adapter: WebMcpAdapter): void;
  configure(config: Partial<WebMcpGlobalConfig>): WebMcpGlobalConfig;
}

declare global {
  interface SubmitEvent {
    agentInvoked?: boolean;
    respondWith?(response: unknown | Promise<unknown>): void;
  }

  interface Navigator {
    modelContext?: NativeModelContext;
  }

  interface Document {
    modelContext?: NativeModelContext;
  }

  interface Window {
    __LITHONO_WEBMCP__?: WebMcpBridge;
  }
}
