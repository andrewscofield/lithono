---
title: Actions and request context
description: Reference the route action helpers, request arguments, action views, redirects, and expected errors.
section: API reference
---

Import action definitions and types from `lithono`. This page covers the main server mutation contract. See [loaders and actions](/docs/loaders-actions) for the mental model and [forms](/docs/forms) for presentation.

## RequestContext and Loader

`Loader` is an alias for `RequestContext`.

| Member | Type / meaning |
| --- | --- |
| `request` | Web `Request` for the operation |
| `url` | Parsed `URL` |
| `params` | String route-parameter record |
| `c` | Hono request context |
| `error` | Optional error supplied in error rendering |
| Application locals | Fields supplied by application/plugin locals and declared through `Locals` augmentation |

An action handler receives the same context plus `input`, typed from its validation schema's output. Read trusted identity from request locals, not submitted ownership fields.

## post, get, put, patch, destroy

```ts
import { post, get, put, patch, destroy } from 'lithono';

const noInput = post(() => ({ done: true }));
```

Each helper accepts either `(handler)` or `(schema, handler)`. The schema must implement Standard Schema v1. Helpers return an action definition; export definitions under the route's `actions` object.

| Helper | HTTP method |
| --- | --- |
| `get` | GET; keep it free of mutations |
| `post` | POST |
| `put` | PUT |
| `patch` | PATCH |
| `destroy` | DELETE |

Use POST for native mutation forms. Other verbs participate in the framework's action contract; browser HTML form method support and method overrides should not be confused with arbitrary native methods.

## defineAction and explicit helpers

`defineAction({ method, input?, run })` is the explicit form. `input` is an optional Standard Schema; `run` receives the validated context and returns a result or promise.

`defineGetAction`, `definePostAction`, `definePutAction`, `definePatchAction`, and `defineDeleteAction` accept the same configuration without `method` and supply their named verb.

Results intended for the client should be serializable. Keep database/provider objects out of returned results and loader snapshots.

## ActionView members

Templates receive an `actions` map. Each action combines callable client behavior with its descriptor:

| Member | Meaning |
| --- | --- |
| `url` | Generated action endpoint for links/forms |
| `method` | Declared HTTP verb |
| `name` | Action name |
| `fields` | Available schema-derived field constraints |
| `values` | Submitted values on validation/operation failure, when available |
| `error` | Action-level failure message |
| `issue(field)` | First relevant field issue message, or no message |

Do not infer a permanent saved result from a pending state or a temporary client message. Use loader-backed confirmation where durability matters.

## HttpError

`new HttpError(status, message, { expose? })` represents an expected HTTP error. `expose` defaults to true for status codes below 500 and false for server errors.

Use 404 for a missing visible resource, 403 for a forbidden operation, and an appropriate conflict status such as 409 for a stale version. Preserve input and explain recovery for expected form failures.

## redirect

`redirect(location, status = 303): never` throws a `Response` with a Location header. It does not return a normal action result.

```ts
import { redirect } from 'lithono';

export function loader() {
  redirect('/books');
}
```

Validate any user-controlled destination before redirecting. Enhanced action redirects participate in the client router; native clients receive HTTP redirect behavior.

## Related types and schema exports

The root entry exports these types for typed integrations:

| Type | Purpose |
| --- | --- |
| `ActionDefinition<TSchema, TOutput>` | Verb, optional input schema, and `run` handler |
| `DefinedAction<TSchema, TOutput>` | Definition plus the framework action marker |
| `ActionRunContext<TInput>` | `RequestContext` plus validated `input` |
| `InferActionInput<TSchema>` | Schema output type, or `void` with no schema |
| `InferActionClient<TActions>` | Action map to async client methods accepting inferred values or `FormData` |
| `ActionDescriptor` / `ActionView<TActions>` | Endpoint metadata / callable metadata view |
| `ActionMeta` | Transported method and field-constraint map |
| `ActionFailureContext` | Failed action name, submitted values, optional issues/error, and status |
| `ActionFailure` | Error payload with `error`, `message`, and optional issues |
| `HttpMethod` | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` |
| `FieldConstraints` | Optional required/type/min/max/minLength/maxLength/pattern/step/enum hints |
| `FieldInputType` | `text`, `number`, `email`, `url`, `date`, `checkbox`, `password`, `select`, or `radio` |

`LITHONO_ACTION` is the string `__lithono`; definition helpers add `[LITHONO_ACTION]: 'action'`. Use the helpers instead of manually maintaining that marker. It is not the action-result envelope format.

`StandardSchemaV1<Input, Output>` describes the `~standard` validation contract and its inference/issue types. `validateSchema(schema, value)` awaits sync or async validation and returns the inferred output. Failure throws `SchemaValidationError`, whose `issues` contain the original schema issues and whose message is the first issue's message (or `Validation failed`). This utility is available in browser-safe root imports, but using it does not automatically install client form validation or serialize a server schema.

See [route contracts](/docs/reference-routes) for `PageModule`/`LayoutModule`, [server integration](/docs/reference-server) for `Locals`, and [action clients](/docs/reference-navigation#action-client-integration) for transport/errors. Prefer the high-level route pattern unless building a reusable integration that needs these lower-level contracts.
