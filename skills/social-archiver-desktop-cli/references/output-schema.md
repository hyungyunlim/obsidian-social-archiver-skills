# Output schema — Social Archiver Desktop CLI

The desktop CLI reuses the shared `cli-core` response contract
(`desktop-app/src/lib/cli/core/response.ts`) — identical to the Obsidian CLI
envelope, so an agent can treat either host the same way.

## Envelope

Success:

```json
{
  "ok": true,
  "command": "social-archiver:archive",
  "version": "0.1.0",
  "data": { },
  "warnings": ["optional"]
}
```

Error:

```json
{
  "ok": false,
  "command": "social-archiver:sync",
  "version": "0.1.0",
  "error": {
    "code": "SERVICE_NOT_READY",
    "message": "…",
    "retryable": false,
    "details": { "optional": "redacted" }
  }
}
```

- `command` is the full namespaced id (`social-archiver`, `social-archiver:archive`, …).
- `version` is the CLI/host version.
- Always branch on `ok`. On failure, branch on `error.code` and honor `error.retryable`.

## Error codes & retryability

| Code | Retryable | Meaning |
| --- | --- | --- |
| `CLI_UNAVAILABLE` | no | CLI surface unavailable |
| `AUTH_REQUIRED` | no | Not authenticated (no/invalid token) |
| `INVALID_ARGUMENT` | no | Bad/missing flag (`error.details.field`) |
| `UNSUPPORTED_PLATFORM` | no | URL/platform not supported |
| `SERVICE_NOT_READY` | yes* | Command not wired on this host, or a service is initializing |
| `PAYWALL_REQUIRED` | no | Upgrade required (billing fallback message) |
| `INSUFFICIENT_CREDITS` | no | Out of credits (billing fallback message) |
| `RATE_LIMITED` | yes | Back off and retry |
| `JOB_NOT_FOUND` | no | Unknown job id |
| `NETWORK_ERROR` | yes | Transient network failure |
| `TIMEOUT_ERROR` | yes | Operation timed out |
| `CIRCUIT_OPEN` | yes | Upstream circuit breaker open |
| `DOC_ID_STALE` | yes | Provider doc_id rotated |
| `OPERATION_FAILED` | varies | Generic; read `retryable` |

\* For not-yet-wired desktop commands, `SERVICE_NOT_READY` is returned with
`retryable: false` — the capability is absent, not merely initializing. Always
trust the response's `retryable` field over this table.

## Redaction

Output is recursively redacted before serialization:

- Keys named like credentials (`authToken`, `accessToken`, `apiKey`, `cookie`,
  `password`, `*Token`, `*Secret`, `*Cookie`, …) → `[REDACTED]`.
- String values matching JWT / `Bearer …` / long opaque tokens → `[REDACTED]`.
- Absolute home paths → `<absolute>`.

Innocent lookalikes (`authenticated`, `tokenizer`) are NOT redacted. Do not try
to defeat redaction by reconstructing secrets from elsewhere.

## Billing fallback

On `INSUFFICIENT_CREDITS` / `PAYWALL_REQUIRED`, `error.message` is the shared
billing fallback string (upgrade/restore via the mobile app with the same
account, or apply a license key). Surface it verbatim. Never attempt a purchase
from the CLI.

## Job statuses

`job --id=<jobId>` returns `data.status` (plus `error`/`progress` when present).
Terminal statuses: `completed`, `failed`, `cancelled`. Poll non-terminal states
with exponential backoff.

## Formats

- Default `format=json`: pretty-printed, re-redacted at the boundary.
- `format=text`: a single `OK <command>: k=v …` or `ERR <command> CODE: message`
  line (≤200 chars). Use json for anything programmatic.
