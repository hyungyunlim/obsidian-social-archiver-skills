# Output Schema

All Social Archiver CLI commands return a JSON envelope when invoked with `format=json`. Agents should always read the envelope's `ok` field first.

## Standard response envelope

```ts
type CliResponse<T> =
  | {
      ok: true;
      command: string;
      version: string;
      data: T;
      warnings?: string[];
    }
  | {
      ok: false;
      command: string;
      version: string;
      error: {
        code: string;
        message: string;
        retryable: boolean;
        details?: Record<string, unknown>;
      };
      warnings?: string[];
    };
```

### Success example

```json
{
  "ok": true,
  "command": "social-archiver:archive",
  "version": "3.6.2",
  "data": {
    "mode": "queue",
    "jobId": "job-1778840000000",
    "status": "pending",
    "url": "https://www.instagram.com/p/example/",
    "platform": "instagram"
  }
}
```

### Error example

```json
{
  "ok": false,
  "command": "social-archiver:archive",
  "version": "3.6.2",
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Credits exhausted. Upgrade or restore via the Social Archiver mobile app on the same account, or apply a license key in plugin settings.",
    "retryable": false
  }
}
```

## Reserved error codes

| Code | Meaning | Retryable |
| --- | --- | --- |
| `CLI_UNAVAILABLE` | Obsidian runtime does not support `registerCliHandler`. | false |
| `AUTH_REQUIRED` | User is not authenticated in the plugin. | false |
| `INVALID_ARGUMENT` | Missing or invalid flag. | false |
| `UNSUPPORTED_PLATFORM` | URL/platform cannot be processed by the requested workflow. | false |
| `SERVICE_NOT_READY` | Required plugin service is not initialized yet. | true |
| `PAYWALL_REQUIRED` | Server rejected request due to quota/paywall. See "Billing fallback policy". | false |
| `INSUFFICIENT_CREDITS` | User credits exhausted. See "Billing fallback policy". | false |
| `RATE_LIMITED` | Server returned a tier-aware rate limit. | true |
| `JOB_NOT_FOUND` | Requested job ID does not exist locally or on server. | false |
| `NETWORK_ERROR` | Network failure reaching Workers or BrightData. | true |
| `TIMEOUT_ERROR` | Operation exceeded its time budget (e.g., direct fetch wall clock). | true |
| `CIRCUIT_OPEN` | Direct service circuit breaker is open (Instagram/Facebook direct). | true |
| `DOC_ID_STALE` | Platform doc_id rotated (Instagram/Facebook direct API). | true |
| `OPERATION_FAILED` | Generic handled failure. | varies (read `retryable`) |

Always trust the `retryable` field in the actual response. The server can override based on context (for example, a rate-limit error during a circuit-open state may surface as `CIRCUIT_OPEN` with `retryable=true`).

## Terminal statuses

### Job statuses (`social-archiver:job`, `social-archiver:import-job`)

- `pending` — queued, not yet processed. **Non-terminal.**
- `processing` — currently running. **Non-terminal.**
- `completed` — finished successfully. **Terminal.**
- `failed` — finished with error. **Terminal.**
- `cancelled` — user-cancelled. **Terminal.**

Agents must stop polling when the status becomes terminal.

### Transcription statuses (`social-archiver:transcribe action=status`)

- `idle` — no run active. **Terminal for polling purposes.**
- `running` — in progress. **Non-terminal.**
- `paused` — user-paused. **Non-terminal.**
- `completed` — finished successfully. **Terminal.**
- `failed` — finished with error. **Terminal.**
- `cancelled` — user-cancelled. **Terminal.**

## Redaction rules

The CLI's response builder strips sensitive fields before serializing. Agents should never see these in output, but agents must also never re-introduce them when relaying responses to the user:

- `authToken`, `accessToken`, `refreshToken`
- `cookie`, `naverCookie`, raw `Authorization` header values
- BrightData, Perplexity, and Gumroad API keys
- Share passwords
- Absolute vault filesystem paths — converted to vault-relative paths unless the command was run with an explicit `verbose=true` on desktop.
- Upstream error payloads that may contain raw request bodies — truncated and normalized.

If a `details` object appears in an error, treat it as best-effort context. It will never contain secret fields, but it may include normalized hints such as the platform name, the affected job ID, or a sanitized URL.

## Billing fallback policy

The Obsidian plugin cannot accept direct payment under store policy. CLI surfaces this fact:

- On `INSUFFICIENT_CREDITS` or `PAYWALL_REQUIRED`, the CLI returns a structured error with `ok: false`. It does **not** open the in-plugin paywall modal, even in foreground execution.
- `error.message` instructs the user to upgrade or restore on the Social Archiver mobile app using the same account, or to apply a license key in Obsidian plugin settings. The wording is not phrased as "pay here".
- When the server responds with the synthetic `mode=notice` archive (`ClientBillingNoticeService`), the CLI converts that into `{ ok: false, error: { code: "INSUFFICIENT_CREDITS", ... } }` rather than passing the notice through as a successful archive. Agents must not treat the notice as a real archive completion.

Agents must surface the billing message verbatim and stop. Do not retry, do not attempt to purchase from CLI, and do not interpret the message as a transient failure.
