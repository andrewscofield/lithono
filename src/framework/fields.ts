import { z } from 'zod';
import type { FieldConstraints, FieldInputType, WebMcpJsonSchema } from './types.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';

interface JsonSchemaNode {
  $schema?: string;
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  format?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  multipleOf?: number;
  enum?: unknown[];
  items?: JsonSchemaNode;
  default?: unknown;
  additionalProperties?: boolean | JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  $ref?: string;
  $defs?: Record<string, JsonSchemaNode>;
  definitions?: Record<string, JsonSchemaNode>;
  [key: string]: unknown;
}

let jsonSchemaProvider: ((schema: unknown) => unknown) | undefined;

export function setJsonSchemaProvider(provider?: (schema: unknown) => unknown): void {
  jsonSchemaProvider = provider;
}

function defaultToJsonSchema(schema: unknown): unknown {
  try {
    return z.toJSONSchema(schema as never);
  } catch {
    return null;
  }
}

function readJsonSchema(schema: StandardSchemaV1 | undefined): JsonSchemaNode | null {
  if (!schema) return null;
  const provider = jsonSchemaProvider ?? defaultToJsonSchema;
  try {
    const json = provider(schema) as JsonSchemaNode | null;
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}

export function deriveFields(
  schema: StandardSchemaV1 | undefined
): Record<string, FieldConstraints> {
  const json = readJsonSchema(schema);
  if (!json) return {};
  return fieldsFromJsonSchema(json, json);
}

export function deriveSchemaDescription(
  schema: StandardSchemaV1 | undefined
): string | undefined {
  const json = readJsonSchema(schema);
  if (!json) return undefined;
  const unwrapped = unwrap(json, json);
  const description = json.description ?? unwrapped.description;
  return typeof description === 'string' && description ? description : undefined;
}

export function inputSchemaFromFields(fields: Record<string, FieldConstraints>): WebMcpJsonSchema {
  const properties: Record<string, WebMcpJsonSchema> = {};
  const required: string[] = [];

  for (const [name, field] of Object.entries(fields)) {
    const prop: WebMcpJsonSchema = {
      type:
        field.type === 'checkbox'
          ? 'boolean'
          : field.type === 'number'
            ? field.step === 1
              ? 'integer'
              : 'number'
            : 'string',
    };
    if (field.description) prop.description = field.description;
    if (field.type === 'email') prop.format = 'email';
    if (field.type === 'url') prop.format = 'uri';
    if (field.type === 'date') prop.format = 'date';
    if (field.min !== undefined) prop.minimum = field.min;
    if (field.max !== undefined) prop.maximum = field.max;
    if (field.minLength !== undefined) prop.minLength = field.minLength;
    if (field.maxLength !== undefined) prop.maxLength = field.maxLength;
    if (field.pattern !== undefined) prop.pattern = field.pattern;
    if (field.enum?.length) prop.enum = [...field.enum];
    properties[name] = prop;
    if (field.required) required.push(name);
  }

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

export function deriveInputSchema(
  schema: StandardSchemaV1 | undefined
): WebMcpJsonSchema | undefined {
  if (!schema) return undefined;
  const json = readJsonSchema(schema);
  if (!json) return inputSchemaFromFields(deriveFields(schema));
  const copy: Record<string, unknown> = { ...json };
  delete copy.$schema;
  return copy as WebMcpJsonSchema;
}

function resolveRef(node: JsonSchemaNode, root: JsonSchemaNode): JsonSchemaNode {
  if (!node.$ref) return node;
  const path = node.$ref.replace(/^#\/?/, '').split('/').filter(Boolean);
  let current: unknown = root;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return node;
    current = (current as Record<string, unknown>)[segment];
  }
  return current && typeof current === 'object' ? (current as JsonSchemaNode) : node;
}

function unwrap(node: JsonSchemaNode, root: JsonSchemaNode): JsonSchemaNode {
  const resolved = resolveRef(node, root);
  const alts = resolved.anyOf ?? resolved.oneOf;
  if (alts?.length) {
    const nonNull = alts.filter((entry) => {
      const inner = resolveRef(entry, root);
      return inner.type !== 'null';
    });
    if (nonNull[0]) return unwrap(nonNull[0], root);
  }
  return resolved;
}

function asTypeList(type: string | string[] | undefined): string[] {
  if (!type) return [];
  return (Array.isArray(type) ? type : [type]).filter((entry) => entry !== 'null');
}

function inputTypeFromSchema(node: JsonSchemaNode): FieldInputType {
  if (node.format === 'email') return 'email';
  if (node.format === 'uri' || node.format === 'url' || node.format === 'uri-reference') return 'url';
  if (node.format === 'date' || node.format === 'date-time') return 'date';
  const types = asTypeList(node.type);
  if (types.includes('number') || types.includes('integer')) return 'number';
  if (types.includes('boolean')) return 'checkbox';
  return 'text';
}

function constraintFromNode(node: JsonSchemaNode, required: boolean, root: JsonSchemaNode): FieldConstraints {
  const prop = unwrap(node, root);
  const types = asTypeList(prop.type);
  const constraints: FieldConstraints = {
    required,
    type: inputTypeFromSchema(prop),
  };

  if (typeof prop.minimum === 'number') constraints.min = prop.minimum;
  if (typeof prop.exclusiveMinimum === 'number') constraints.min = prop.exclusiveMinimum;
  if (typeof prop.maximum === 'number') constraints.max = prop.maximum;
  if (typeof prop.exclusiveMaximum === 'number') constraints.max = prop.exclusiveMaximum;
  if (typeof prop.minLength === 'number') constraints.minLength = prop.minLength;
  if (typeof prop.maxLength === 'number') constraints.maxLength = prop.maxLength;
  if (typeof prop.pattern === 'string') constraints.pattern = prop.pattern;
  if (typeof prop.multipleOf === 'number') constraints.step = prop.multipleOf;
  else if (types.includes('integer')) constraints.step = 1;
  if (Array.isArray(prop.enum)) {
    constraints.enum = prop.enum.map((value) => String(value));
    if (constraints.type === 'text') constraints.type = 'select';
  }
  const description = node.description ?? prop.description;
  if (typeof description === 'string' && description) {
    constraints.description = description;
  }

  return constraints;
}

function fieldsFromJsonSchema(
  schema: JsonSchemaNode,
  root: JsonSchemaNode
): Record<string, FieldConstraints> {
  const objectSchema = unwrap(schema, root);
  if (!objectSchema.properties) return {};
  const required = new Set(objectSchema.required ?? []);
  const fields: Record<string, FieldConstraints> = {};
  for (const [name, prop] of Object.entries(objectSchema.properties)) {
    fields[name] = constraintFromNode(prop, required.has(name), root);
  }
  return fields;
}

export { issueForField, issuePathKey } from './action-issues.ts';
