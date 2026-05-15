# Social Archiver CLI Command Catalog

Every command is invoked as:

```
obsidian vault=<vault> <command> [flags...]
```

Always include `format=json` for agent consumption. `vault=<vault>` must be the first parameter per Obsidian CLI conventions.

For the standard response envelope, error codes, and redaction rules, see `output-schema.md`. The `data` shapes below show only the success payload — wrap them in the envelope `{ ok: true, command, version, data, warnings? }`.

---

## Default + P0 commands

These are the foundational commands. P0 is sufficient for most archive automation workflows.

### `social-archiver`

Synopsis:

```
obsidian vault=<vault> social-archiver [format=json|text]
```

Print plugin status, version, capability list, and auth/config readiness.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver format=json
```

`data` shape:

```json
{
  "pluginId": "social-archiver",
  "authenticated": true,
  "username": "user",
  "vault": "Research",
  "features": {
    "archive": true,
    "profileCrawl": true,
    "instagramImport": false,
    "batchTranscription": true
  }
}
```

---

### `social-archiver:archive`

Synopsis:

```
obsidian vault=<vault> social-archiver:archive url=<url> [mode=queue|sync|fetch] [media=all|images|none] [comments] [transcript] [formattedTranscript] [tags=<csv>] [comment=<text>] [wait] [format=json|text]
```

Archive a single URL. Defaults to queue mode.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | string | yes | — | Source URL of the post / page to archive. |
| `mode` | enum `queue` \| `sync` \| `fetch` | no | `queue` | `queue` returns a job ID. `sync` blocks until the orchestrator finishes. `fetch` returns sanitized `PostData` without writing a note. |
| `media` | enum `all` \| `images` \| `none` | no | `all` | Media download policy. |
| `comments` | bool | no | `false` | Include comments. |
| `transcript` | bool | no | `false` | Request transcript (video/audio platforms). |
| `formattedTranscript` | bool | no | `false` | Request formatted transcript output. |
| `tags` | csv string | no | — | Comma-separated tags to apply to the resulting note. |
| `comment` | string | no | — | User-supplied note appended to the archive. |
| `wait` | bool | no | `false` | Honor only with `mode=sync`. Otherwise ignored. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:archive \
  url="https://www.instagram.com/p/example/" \
  mode=queue media=all tags="favorites,research" format=json
```

`data` shape (queue mode):

```json
{
  "mode": "queue",
  "jobId": "job-1778840000000",
  "status": "pending",
  "url": "https://www.instagram.com/p/example/",
  "platform": "instagram"
}
```

`data` shape (sync mode): includes `filePath`, `platform`, optional `archiveId`.

`data` shape (fetch mode): includes sanitized `PostData` (no `filePath`, no write).

---

### `social-archiver:job`

Synopsis:

```
obsidian vault=<vault> social-archiver:job id=<job-id> [source=local|server|auto] [format=json|text]
```

Get one archive job's status.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string | yes | — | Job ID returned by `social-archiver:archive`. |
| `source` | enum `local` \| `server` \| `auto` | no | `auto` | Where to read state from. `auto` tries local first then server. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:job \
  id="job-1778840000000" format=json
```

`data` shape:

```json
{
  "jobId": "job-1778840000000",
  "status": "completed",
  "url": "https://www.instagram.com/p/example/",
  "platform": "instagram",
  "filePath": "Social Archives/Instagram/2026/05/example.md",
  "retryCount": 0,
  "lastError": null,
  "serverWorkerJobId": "wjob-abc123",
  "createdAt": "2026-05-15T08:00:00.000Z",
  "updatedAt": "2026-05-15T08:01:23.000Z"
}
```

Terminal statuses: `completed`, `failed`, `cancelled`. Non-terminal: `pending`, `processing`.

---

### `social-archiver:jobs`

Synopsis:

```
obsidian vault=<vault> social-archiver:jobs [status=pending|processing|completed|failed|cancelled|all] [limit=<n>] [format=json|text]
```

List jobs.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `status` | enum (see synopsis) | no | `all` | Filter by status. |
| `limit` | integer | no | `50` | Max jobs returned. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:jobs \
  status=pending limit=20 format=json
```

`data` shape:

```json
{
  "count": 3,
  "jobs": [
    { "jobId": "job-...", "status": "pending", "url": "...", "platform": "instagram", "createdAt": "..." }
  ]
}
```

---

### `social-archiver:jobs:check`

Synopsis:

```
obsidian vault=<vault> social-archiver:jobs:check [syncServer] [format=json|text]
```

Schedule pending-job catch-up. **Fire-and-forget** — returns immediately; observe results by polling `social-archiver:jobs` afterwards. (Obsidian 1.12.7 CLI loses handler output when the handler awaits real I/O, so this command schedules the work and returns synchronously.)

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `syncServer` | bool | no | `false` | Also schedule server pending-job catch-up. Only honored if user has `enableServerPendingJobs` enabled. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:jobs:check \
  syncServer=true format=json
```

`data` shape:

```json
{
  "scheduled": true,
  "targets": ["local", "server"]
}
```

If `syncServer=true` but the user setting is off, the response includes `"skipped": "setting_disabled"` and `targets` omits `"server"`.

---

### `social-archiver:sync`

Synopsis:

```
obsidian vault=<vault> social-archiver:sync [target=subscriptions|library|pending|all] [syncServer=true|false] [format=json|text]
```

Schedule explicit sync tasks. **Fire-and-forget** — returns immediately listing scheduled targets; observe results via subsequent reads (e.g. `social-archiver:jobs`, vault contents).

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `target` | enum `subscriptions` \| `library` \| `pending` \| `all` | no | `all` | Which sync sub-tasks to schedule. |
| `syncServer` | bool | no | `false` | When `target` includes pending, also schedule server pending-job catch-up. Honored only when `enableServerPendingJobs` is enabled. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

`sync target=all` schedules subscriptions sync, library sync, and local pending-job processing in parallel. The response lists which sub-targets were scheduled versus skipped (e.g. when a sync service is unavailable). Outbound delete sync is intentionally **not** part of CLI sync (per 2026-04-12 mass-deletion incident mitigation).

Example:

```bash
obsidian vault="Research" social-archiver:sync \
  target=all syncServer=true format=json
```

`data` shape:

```json
{
  "scheduled": true,
  "targets": ["subscriptions", "library", "pending"],
  "skipped": []
}
```

---

## P1 commands

### `social-archiver:profile-crawl`

Synopsis:

```
obsidian vault=<vault> social-archiver:profile-crawl url=<url> [count=<n>] [range=all|7d|30d|90d|custom] [start=<YYYY-MM-DD>] [end=<YYYY-MM-DD>] [subscribe] [hour=<0-23>] [redditSort=hot|new|top|rising] [redditTime=now|today|week|month|year|all] [keyword=<text>] [rss=true|false] [naverCookie=<base64>] [naverSubscriptionType=blog|cafe-member] [format=json|text]
```

Crawl a profile or RSS source now, optionally creating a subscription.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | string | yes | — | Profile URL or RSS feed. |
| `count` | integer | no | `20` | Max posts to fetch. |
| `range` | enum `all` \| `7d` \| `30d` \| `90d` \| `custom` | no | `30d` | Date range filter. |
| `start` | date `YYYY-MM-DD` | conditional | — | Required when `range=custom`. |
| `end` | date `YYYY-MM-DD` | conditional | — | Required when `range=custom`. |
| `subscribe` | bool | no | `false` | Create a subscription on top of the immediate crawl. |
| `hour` | integer `0-23` | no | — | Local hour at which the subscription cron should run. |
| `redditSort` | enum `hot` \| `new` \| `top` \| `rising` | no | — | Reddit-specific sort. |
| `redditTime` | enum `now` \| `today` \| `week` \| `month` \| `year` \| `all` | no | — | Reddit-specific time window. |
| `keyword` | string | no | — | Keyword filter applied to fetched posts. |
| `rss` | bool | no | auto-detected | Force-treat the URL as RSS. |
| `naverCookie` | base64 string | no | — | Required for Naver Cafe member content / private blog content. Never logged. |
| `naverSubscriptionType` | enum `blog` \| `cafe-member` | no | — | Naver subscription variant. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:profile-crawl \
  url="https://www.threads.net/@example" \
  count=20 range=30d subscribe hour=9 format=json
```

`data` shape:

```json
{
  "jobId": "job-...",
  "subscriptionId": "sub-...",
  "platform": "threads",
  "handle": "example",
  "estimatedPosts": 20
}
```

---

### `social-archiver:subscribe`

Synopsis:

```
obsidian vault=<vault> social-archiver:subscribe url=<url> [hour=<0-23>] [folder=<vault-path>] [naverCookie=<base64>] [naverSubscriptionType=blog|cafe-member] [format=json|text]
```

Create a subscription without an immediate crawl.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | string | yes | — | Profile or feed URL. |
| `hour` | integer `0-23` | no | — | Local hour for the subscription cron. |
| `folder` | string (vault path) | no | — | Destination folder override. |
| `naverCookie` | base64 string | no | — | Naver-only authentication blob. Never logged. |
| `naverSubscriptionType` | enum `blog` \| `cafe-member` | no | — | Naver subscription variant. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:subscribe \
  url="https://example.com/feed.xml" hour=9 \
  folder="Social Archives/Newsletters" format=json
```

`data` shape:

```json
{
  "subscriptionId": "sub-...",
  "platform": "rss",
  "handle": "example.com",
  "cron": "0 9 * * *"
}
```

---

### `social-archiver:googlemaps`

Synopsis:

```
obsidian vault=<vault> social-archiver:googlemaps [path=<vault-path>] [content=<text>] [urls=<csv>] [yes] [max=<n>] [format=json|text]
```

Batch archive Google Maps links from explicit content, a note path, or URLs. CLI requires `yes` (or non-interactive mode) to avoid accidental archive bursts.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `path` | string (vault path) | conditional | — | Vault note to extract links from. One of `path`, `content`, or `urls` is required. |
| `content` | string | conditional | — | Inline text to extract links from. |
| `urls` | csv string | conditional | — | Comma-separated Google Maps URLs. |
| `yes` | bool | yes | `false` | Skip confirmation. Required for CLI. |
| `max` | integer | no | `25` | Hard cap on URLs queued. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:googlemaps \
  path="Trips/Tokyo 2026.md" yes max=10 format=json
```

`data` shape:

```json
{
  "batchJobId": "batch-...",
  "discovered": 12,
  "queued": 10,
  "skipped": 2,
  "createdPaths": []
}
```

---

### `social-archiver:import-instagram`

Synopsis:

```
obsidian vault=<vault> social-archiver:import-instagram files=<path1[,path2,...]> [destination=inbox|archive] [tags=<csv>] [rate=<items/sec>] [preflight] [format=json|text]
```

Start an Instagram Saved ZIP import. `preflight` runs validation only.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `files` | csv string of file paths | yes | — | One or more ZIP file paths. Desktop-only when absolute paths are used. |
| `destination` | enum `inbox` \| `archive` | no | `inbox` | Where to materialize imported items. |
| `tags` | csv string | no | — | Tags to apply to every imported note. |
| `rate` | float (items/sec) | no | — | Throttle for the import job. |
| `preflight` | bool | no | `false` | Return `ImportPreflightResult` without starting a job. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example (preflight):

```bash
obsidian vault="Research" social-archiver:import-instagram \
  files="/Users/me/Downloads/instagram_saved.zip" \
  preflight format=json
```

`data` shape (start):

```json
{ "jobId": "import-...", "fileCount": 1, "queuedItems": 482 }
```

`data` shape (preflight): `ImportPreflightResult` summary including total items, duplicates, conflicts, estimated runtime.

---

### `social-archiver:import-job`

Synopsis:

```
obsidian vault=<vault> social-archiver:import-job id=<job-id> [items] [format=json|text]
```

Get Instagram import job state and item counts.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string | yes | — | Import job ID. |
| `items` | bool | no | `false` | Include per-item array (can be large). |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:import-job \
  id="import-abc" items format=json
```

`data` shape:

```json
{
  "jobId": "import-abc",
  "status": "processing",
  "totalItems": 482,
  "completed": 120,
  "failed": 2,
  "remaining": 360,
  "items": []
}
```

---

### `social-archiver:import-control`

Synopsis:

```
obsidian vault=<vault> social-archiver:import-control id=<job-id> action=pause|resume|cancel [format=json|text]
```

Pause, resume, or cancel an import job.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string | yes | — | Import job ID. |
| `action` | enum `pause` \| `resume` \| `cancel` | yes | — | Control action. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:import-control \
  id="import-abc" action=pause format=json
```

`data` shape:

```json
{ "jobId": "import-abc", "previousStatus": "processing", "currentStatus": "paused" }
```

---

## P2 commands

### `social-archiver:post`

Synopsis:

```
obsidian vault=<vault> social-archiver:post [path=<vault-path>] [active] [format=json|text]
```

Post a vault note into the local timeline.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `path` | string (vault path) | conditional | — | Note path. One of `path` or `active` required. |
| `active` | bool | conditional | `false` | Use the active note in Obsidian. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:post \
  path="Notes/My Thoughts.md" format=json
```

`data` shape:

```json
{ "postId": "post-...", "path": "Notes/My Thoughts.md", "mediaCount": 0 }
```

---

### `social-archiver:share`

Synopsis:

```
obsidian vault=<vault> social-archiver:share [path=<vault-path>] [active] [reader] [format=json|text]
```

Post and create/copy a share URL.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `path` | string (vault path) | conditional | — | Note path. One of `path` or `active` required. |
| `active` | bool | conditional | `false` | Use the active note. |
| `reader` | bool | no | `false` | Use reader-mode share variant. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:share \
  path="Notes/My Thoughts.md" reader format=json
```

`data` shape:

```json
{ "shareId": "share-...", "shareUrl": "https://share.social-archive.org/s/...", "readerUrl": "..." }
```

Share passwords are never returned in CLI output.

---

### `social-archiver:tags`

Synopsis:

```
obsidian vault=<vault> social-archiver:tags [counts] [format=json|text]
```

List tag definitions and discovered tags.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `counts` | bool | no | `false` | Include usage counts. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:tags counts format=json
```

`data` shape:

```json
{
  "definitions": [ { "name": "favorites", "color": "#f59e0b" } ],
  "discovered": [ { "name": "instagram", "count": 42 } ]
}
```

---

### `social-archiver:tag-create`

Synopsis:

```
obsidian vault=<vault> social-archiver:tag-create name=<tag> [color=<hex>] [format=json|text]
```

Create a tag definition.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `name` | string | yes | — | Tag name. |
| `color` | hex color string | no | — | Display color (e.g. `#f59e0b`). |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:tag-create \
  name="favorites" color="#f59e0b" format=json
```

`data` shape:

```json
{ "name": "favorites", "color": "#f59e0b", "created": true }
```

---

### `social-archiver:tag-apply`

Synopsis:

```
obsidian vault=<vault> social-archiver:tag-apply path=<vault-path> tag=<tag> action=add|remove|toggle [format=json|text]
```

Add, remove, or toggle a tag on a note.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `path` | string (vault path) | yes | — | Target note path. |
| `tag` | string | yes | — | Tag name. |
| `action` | enum `add` \| `remove` \| `toggle` | yes | — | Mutation. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:tag-apply \
  path="Social Archives/Instagram/2026/05/example.md" \
  tag="favorites" action=add format=json
```

`data` shape:

```json
{ "path": "Social Archives/Instagram/2026/05/example.md", "tag": "favorites", "appliedAction": "add", "presentBefore": false, "presentAfter": true }
```

---

### `social-archiver:transcribe`

Synopsis:

```
obsidian vault=<vault> social-archiver:transcribe [mode=transcribe-only|download-and-transcribe] action=start|pause|resume|cancel|status [format=json|text]
```

Start or control batch transcription. Desktop-only.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `mode` | enum `transcribe-only` \| `download-and-transcribe` | conditional | — | Required for `action=start`. |
| `action` | enum `start` \| `pause` \| `resume` \| `cancel` \| `status` | yes | — | Control action. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:transcribe \
  mode=transcribe-only action=start format=json

obsidian vault="Research" social-archiver:transcribe \
  action=status format=json
```

`data` shape (status):

```json
{
  "status": "running",
  "mode": "transcribe-only",
  "queued": 12,
  "completed": 4,
  "failed": 1,
  "current": { "path": "...", "progress": 0.42 }
}
```

Terminal statuses: `idle`, `completed`, `failed`, `cancelled`.

---

### `social-archiver:media`

Synopsis:

```
obsidian vault=<vault> social-archiver:media [path=<vault-path>] [active] action=redownload-expired|detach|redownload-detached [format=json|text]
```

Re-download expired or detached media, or detach local media for a note.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `path` | string (vault path) | conditional | — | Target note path. One of `path` or `active` required. |
| `active` | bool | conditional | `false` | Use the active note. |
| `action` | enum (see synopsis) | yes | — | Media action. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:media \
  path="Social Archives/Instagram/2026/05/example.md" \
  action=redownload-expired format=json
```

`data` shape:

```json
{
  "path": "Social Archives/Instagram/2026/05/example.md",
  "action": "redownload-expired",
  "checked": 5,
  "redownloaded": 3,
  "failed": 0
}
```

---

### `social-archiver:author-notes`

Synopsis:

```
obsidian vault=<vault> social-archiver:author-notes [dryRun] [limit=<n>] [format=json|text]
```

Create or update author notes for existing authors.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `dryRun` | bool | no | `false` | Don't write — return planned changes only. |
| `limit` | integer | no | — | Cap on authors processed in this run. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:author-notes \
  dryRun limit=10 format=json
```

`data` shape:

```json
{
  "scanned": 124,
  "created": 0,
  "updated": 0,
  "planned": [ { "author": "example", "path": "Authors/example.md", "change": "create" } ]
}
```

---

### `social-archiver:ai-comment`

Synopsis:

```
obsidian vault=<vault> social-archiver:ai-comment path=<vault-path> type=<...> [provider=claude|gemini|codex] [prompt=<text>] [language=<lang>] [outputLanguage=<auto|lang>] [format=json|text]
```

Generate an AI comment (summary, fact-check, key points, sentiment, etc.) for a note. **Fire-and-forget** — the response is `{ scheduled: true, ... }` and the actual generation runs in the background (typical wall clock 15-60s depending on type and provider). Observe completion with `social-archiver:ai-comments path=...`. Desktop-only — requires a locally installed AI CLI (`claude`, `gemini`, or `codex`).

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `path` | vault-path | yes | — | Target note path. |
| `type` | enum | yes | — | One of `summary`, `factcheck`, `critique`, `keypoints`, `sentiment`, `connections`, `translation`, `translate-transcript`, `glossary`, `reformat`, `custom`. |
| `provider` | enum | no | first authenticated | `claude` \| `gemini` \| `codex`. If the chosen provider is missing or unauthenticated, the service auto-falls back to any installed and authenticated one. |
| `prompt` | text | conditional | — | Required when `type=custom`. |
| `language` | string | conditional | — | Required when `type=translation` or `type=translate-transcript` (ISO 639-1 code, e.g. `ko`, `en`, `ja`). |
| `outputLanguage` | string | no | `auto` | Language used for the AI response itself. `auto` matches the content language. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:ai-comment \
  path="Social Archives/X/2026/05/post.md" \
  type=summary provider=claude format=json
```

`data` shape:

```json
{
  "scheduled": true,
  "path": "Social Archives/X/2026/05/post.md",
  "type": "summary",
  "provider": "claude",
  "estimatedSeconds": 20
}
```

Errors:

- `INVALID_ARGUMENT` — missing/invalid `path`, `type`, `provider`; or `type=custom` without `prompt`; or translation type without `language`; or no AI CLI installed/authenticated.
- `UNSUPPORTED_PLATFORM` — invoked on mobile (no local AI CLI).

---

### `social-archiver:ai-comments`

Synopsis:

```
obsidian vault=<vault> social-archiver:ai-comments path=<vault-path> [format=json|text]
```

List AI comments stored on a note. Read-only; parses the `## AI Comments` section and metadata of the target file. Use this to observe completion of an `ai-comment` job.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `path` | vault-path | yes | — | Note to inspect. |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

Example:

```bash
obsidian vault="Research" social-archiver:ai-comments \
  path="Social Archives/X/2026/05/post.md" format=json
```

`data` shape:

```json
{
  "path": "Social Archives/X/2026/05/post.md",
  "count": 2,
  "comments": [
    {
      "id": "claude-summary-20260515T103000Z",
      "cli": "claude",
      "type": "summary",
      "generatedAt": "2026-05-15T10:30:00Z",
      "processingTime": 18420,
      "contentLength": 412
    }
  ]
}
```

---

### `social-archiver:ai-providers`

Synopsis:

```
obsidian vault=<vault> social-archiver:ai-providers [format=json|text]
```

List installed AI CLI providers (`claude`, `gemini`, `codex`) and their availability + authentication status. Synchronous read of the plugin's cached detection result; the first call may report `available=false` until detection completes in the background.

| Flag | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `format` | enum `json` \| `text` | no | `json` | Output format. |

`data` shape:

```json
{
  "desktop": true,
  "providers": [
    { "cli": "claude", "displayName": "Claude Code", "available": true, "authenticated": true, "path": "/opt/homebrew/bin/claude", "version": "1.5.0" },
    { "cli": "gemini", "displayName": "Gemini CLI", "available": false, "authenticated": false, "path": null, "version": null },
    { "cli": "codex", "displayName": "OpenAI Codex", "available": true, "authenticated": false, "path": "/usr/local/bin/codex", "version": "0.42.0" }
  ]
}
```

On mobile, `desktop=false` and all providers list `available=false`.
