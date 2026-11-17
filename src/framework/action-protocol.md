# Action transport v1 (Phase 1)

Framework JSON action responses now have `X-Lithono-Action-Protocol: 1` and a
versioned envelope. Deploy server and client together; old clients cannot decode
this wire format. Custom HTTP clients must check the header and decode it too.

```json
{
  "version": 1,
  "ok": true,
  "result": { "kind": "value", "value": null },
  "meta": { "refresh": { "status": "skipped" } }
}
```

`result.kind: "undefined"` explicitly represents a top-level undefined return.
Null, arrays, primitives, and objects retain their shape. Values must otherwise
be JSON-serializable: nested undefined, Dates, non-finite numbers, and other
special values still follow normal JSON rules. Cyclic values and BigInt cannot
be transported; a serialization failure is logged and returns a generic 500.
Because serialization happens after execution, that failure does not prove a
mutation was rolled back.

Failures use `{ version: 1, ok: false, error: { error, message, issues? } }` with
an appropriate HTTP error status. Unexpected exceptions are logged on the
server and expose only `Action failed`. Schema failures and explicitly exposed
`HttpError`s retain their public messages. HTML form validation still uses the
SSR failure context with posted values.

## Migration decisions

- Application `revalidate`, `redirect`, `result`, and `__lithono` keys are now
  ordinary data. No legacy merged-metadata decoding is attempted: it is
  ambiguous and could steal application data.
- To skip refresh, use the existing request header `X-Lithono-Revalidate: 0`
  (enhanced forms: `data-revalidate="false"`). Returning `{ revalidate: false }`
  no longer skips refresh or removes that key from the result.
- Replace returned `{ redirect: "/next" }` with the existing
  `redirect("/next")` helper or a redirect `Response`. The form host's legacy
  result-key navigation was removed to match this decision. Plain HTML success
  redirects to the current pathname unless the action explicitly returns or
  throws a Response.
- Returned/thrown redirect Responses become successful JSON envelopes with
  `meta.redirect`. Cookies and prepared Hono headers are preserved. The action
  proxy navigates directly; it does not parse the destination HTML as JSON.
  Non-JSON requests retain the original HTTP redirect.
- `unwrapActionResult` now accepts a v1 envelope, not arbitrary JSON or the old
  merged format. Custom `createActionProxy` unwrap callbacks receive the v1
  envelope. Raw JSON Responses bypass that callback, so protocol-like
  application keys remain intact.

## Refresh outcomes

`meta.refresh.status` is `skipped`, `success` (with loader `payload`), or
`failed` (with a generic message). Failed refresh remains HTTP 200 / `ok: true`
and returns the action's successful result. Server logs contain the exception.
The data-aware client emits bubbling/composed `lithono:revalidate-error` on the
page, separately from action failure; it does not overwrite cached loader data
or throw an `ActionRequestError`. Listen for that event to display stale-data
UI. Successful refresh keeps the existing `lithono:revalidate` event.
Custom proxy consumers can inspect metadata in their unwrap callback.

## Unsafe request provenance

POST/PUT/PATCH/DELETE actions require same-origin evidence when supplied:

1. Explicit `Sec-Fetch-Site: cross-site` is rejected.
2. Origin takes precedence; null, malformed, or different origins are rejected.
3. Without Origin, Referer must have the same origin if present.
4. Without either, non-browser/privacy clients are allowed, except fetch-site
   evidence of `same-site`, `cross-site`, or an unknown value is rejected.

Comparison uses the actual request URL, including scheme and port, without
trusting forwarded host headers. Reverse proxies must provide a correct public
request URL. This is a browser provenance guard, not authentication or a CSRF
token system. Deliberately allowing both headers to be absent preserves CLI
clients and privacy configurations. Validation and action execution happen
after the guard; routing may already have parsed a form to discover `_action`.
GET actions are exempt and must not mutate state.

## Raw Responses

Non-redirect Responses remain raw. Successful JSON/+json Responses return
their parsed value; 204/205 return undefined; successful non-JSON Responses
return an unread `Response` for the caller to consume. Raw HTTP failures become
`ActionRequestError`s; non-JSON failures use a generic fallback rather than
exposing HTML/text bodies. Already-followed redirects navigate to `response.url`.
Same-origin manual redirects navigate using Location. Opaque manual redirects
raise a clear error because the browser withholds their destination; use the
default fetch redirect mode.

The existing inferred action return types do not model redirect navigation or
raw-response decoding (for example `Promise<Response>` versus parsed raw JSON).
That pre-existing typing mismatch remains a follow-up API design concern.
