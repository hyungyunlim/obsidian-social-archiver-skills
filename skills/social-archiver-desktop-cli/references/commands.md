# Command catalog — Social Archiver Desktop CLI

Invocation: `sa <command> [--flag value | --flag=value | --bare-flag]` (the
canonical `social-archiver <command>` also works; in dev from `desktop-app/`,
`npm run cli -- <command> …`). Subcommands drop the `social-archiver:` prefix
(`archive`, `jobs:check`, `tag-create`, …); `status` is the default command.

> Scope & limits — **public content only**, **credits** (free 10 / pro 500 /
> beta-free unlimited per month), **rate limits**, and the "archive only content
> you have permission to save" disclaimer apply to every command here. See
> **"Scope, limits & disclaimer"** in `SKILL.md` before archiving on a user's
> behalf.

Flag definitions are the shared `cli-core` set (`packages/cli-core/src/core/flags.ts`),
so they match the Obsidian CLI. Availability reflects the current desktop
scaffold; not-yet-wired commands return `SERVICE_NOT_READY`.

Global flag: `--format <json|text>` (default `json`).

---

## Auth (binary-level — manage the local credential file)

Not server commands; they read/write `~/.config/social-archiver/credentials.json`
(override dir via `SOCIAL_ARCHIVER_CONFIG_DIR`). The token is never echoed back.

### `login`
Sign in and persist the token (file mode 0600). `data` = `{ saved, username?, location, clientId }`.

**Interactive (default — no `--token`):** runs the cross-device device-code flow —
prints a 6-char code + QR (to stderr) and polls until you approve on your phone
(scan / enter the code in the app) or on a signed-in desktop app (auto-opened
`socialarchiver-desktop://auth/approve-device` deep link → approve modal). No
secret is ever printed; only the code/URL/username.
- `--client-id <id>` (optional)
- `--no-open-desktop` (don't auto-open the local desktop approve link)
```bash
sa login                       # interactive (phone / desktop approve)
```

**Manual / CI (`--token`):** persists a token you already have — no network, no prompt.
- `--token <token>`
- `--client-id <id>` (optional)
```bash
sa login --token "<token>" --client-id desktop-cli
```

### `logout`
Remove the stored credentials file. `data` = `{ removed, location }`.
```bash
sa logout
```

## Workspace — find / analyze locally (recommended)

### `export`
Materialize archives to local Markdown files so you can `grep`/read/analyze them
**without per-item server calls** (one paginated call returns full content). Each
file has frontmatter (`archiveId`, platform, url, author, dates) + the post body.
- `--dir <path>` (default `<config-dir>/workspace`)
- `--limit <n>` (default 100)
- `--since <ISO>` (server-side delta — only archives updated after this time)
- `--archived <true|false>` (bookmark filter: `false` = **Inbox only**, `true` =
  **Archived only**, omitted = both). Use `--archived false` to list Inbox items
  to triage, then `bookmark` the ones to keep.
```bash
sa export --dir ./workspace --limit 50
grep -ril "keyword" ./workspace      # find by content (0 server calls)
# then read/analyze the matched .md files directly
```
Read-only. Prefer this for find/analyze; reserve server calls for mutations
(which should be batched). Re-running overwrites by filename (idempotent).

### `bookmark` — ✅
Bulk set the **Archived** state (`is_bookmarked`) on archives — the same action
as the app's "Archive" button (moves posts in/out of the **Inbox**). Maps to the
server `bulk-actions` endpoint; the host chunks at ≤200 IDs/request.
- `--ids <id1,id2>` (required; archive IDs — from `export` frontmatter or `search`)
- `--off` (un-bookmark instead → move back to Inbox)

`data` = `{ bookmarked, requested, updatedIds[], failed[] }` (per-archive failures
in `failed`, not a whole-call error).
```bash
# Triage Inbox: list inbox items, then archive the ones to keep
sa export --dir ./inbox --archived false --limit 200
#   → review files, collect archiveId frontmatter of the keepers
sa bookmark --ids "id-1,id-2,id-3"        # move them out of Inbox
sa bookmark --ids "id-9" --off            # send one back to Inbox
```

## Mutate — classify / comment (workspace file → server)

Each takes a materialized `.md` file (from `export`), reads its `archiveId`
frontmatter, and mutates via the server. Auth-gated; never reads the GUI store.

### `tag` — ✅ classify
`tag <file.md ...> --add <t1,t2> [--remove <t>] [--color <#hex>]`. Batched: one
`upsertTags` (name→id) + one `upsertArchiveTags` for all files/tags (load-light).
```bash
grep -ril "topic" ./workspace | xargs sa tag --add topic
```

### `note` — ✅ comment (personal note)
`note <file.md> --text "<text>"`. Read-modify-write (fetches existing notes,
appends). The agent-natural "comment": analyze the file yourself, record a note.

### `ai-comment` — ✅ queues a job (run it with `executor`, or inline with `--run`)
`ai-comment <file.md> --type <summary|factcheck|critique|keypoints|sentiment|connections|translation|glossary|reformat|custom> [--provider <claude|gemini|codex>] [--language <lang>] [--run]`.
Availability handshake → `createAICommentJob`; returns a `jobId`. The comment is
produced by a separate executor (the desktop GUI, or `executor --watch` — see
below), NOT this CLI — returns `SERVICE_NOT_READY` if no executor is available.

**`--run`** does the whole thing in one process: it registers THIS process as a
one-shot `tauri-desktop` executor, queues the job (so the handshake targets it),
runs it locally via your provider CLI (claude/gemini/codex), then advertises
disabled on exit. No separate `executor --watch` needed. Requires a local
provider (else `SERVICE_NOT_READY`); on success `data` = `{ jobId, status,
ranLocally, provider, note }`. The comment is appended server-side and syncs to
all devices (read it back with `export`/`search`). Graceful degradation: if the
desktop GUI is the active executor, it may claim the job instead — then
`ranLocally:false` and the GUI completes it.
```bash
sa ai-comment ./workspace/2026-x.md --type summary --run
```
This command still creates AI comments. For server content-variant translation
jobs (`content.translate_variant`), use the app/server AI-action flow; the
desktop headless executor can run those jobs once they are queued.

### `push` — ✅ write-back (declarative frontmatter sync)
`push <file.md|dir ...> [--dry-run]`. The reverse of `export`: edit a
materialized file's **frontmatter**, then push the diff to the server. Each file
is matched to its archive by the `archiveId` frontmatter key (the join key), its
frontmatter is diffed against the server's current state, and only the *changed*
structured fields are pushed.

Write-back fields (frontmatter only — v1):
- `tags:` → **add-only** union-merge (`upsertTags`+`upsertArchiveTags`). Tags in the
  file but not on the server are added; tags on the server but absent from the file
  are **NOT** removed. (To remove a tag, use `tag <file> --remove <t>`.)
- `bookmarked: true|false` → `toggleBookmark`
- `liked: true|false` → `toggleLike`

Rules:
- A file with a missing **or unknown** `archiveId` (one the server no longer has) is
  treated as a new local note and **skipped** (never an error). A field whose
  frontmatter key is **absent** is left untouched (so a file with no `tags:` block —
  or an empty `tags: []` — never changes the archive's server tags).
- `--dry-run` reports the exact plan (per-file `changes`) and pushes nothing —
  always preview before a real push.
- Idempotent: re-running after a successful push is a no-op. Per-file failures are
  recorded in `data.files[].error` and do not abort the rest of the run; check
  `data.summary` (`{ total, changed, skipped, failed, pushed }`).
- Free-form body edits (`### Notes` / `### Highlights` sections) are **not** written
  back in v1 — use `note` for personal notes (PRD §16). `push` is frontmatter-only.

```bash
sa push ./workspace --dry-run     # preview every file in the workspace
sa push ./workspace/2024-x.md     # push one file's frontmatter edits
```

> Difference from `tag`: `tag` applies an explicit `--add`/`--remove` op to specific
> files; `push` reconciles a file's whole frontmatter, adding any new tags in the
> `tags:` list. Neither removes a tag by its absence from the list — removal is
> always the explicit `tag --remove` (matching the plugin's `tagApply` parity), so
> a partially-edited file can never silently wipe an archive's existing tags.

> These desktop workspace commands shadow the same-named cli-core path-based
> commands (`tag-apply`/`ai-comment`) below, which stay `SERVICE_NOT_READY` here.

## Executor (headless — claim + run server AI jobs locally)

Registers this machine as a `tauri-desktop` executor, then claims AI-comment jobs
and the supported AI-action subset locally with a provider CLI (`claude` /
`gemini` / `codex`). The supported action subset is intentionally narrow:
`content.translate_variant` is handled and uploaded as a server content variant;
tag-patch actions and other content variants such as `content.reformat_variant`
are not claimed by the desktop executor and should route to Obsidian executor or
Cloud AI. Output is **NDJSON** (`--format json`, default): `{event,…}` progress
lines plus a terminal `CliResponse`. `node:*` and the provider subprocess stay in
the cli/ Node layer; provider auth is checked by **presence only** (never reads
key contents).

### `executor` — ✅ one-shot
Register, drain the currently-available job backlog to completion, then exit.
Requires an authenticated account **and** a ready provider; else `AUTH_REQUIRED`
or `SERVICE_NOT_READY`.

### `executor --watch` — ✅ loop
Poll + run jobs until interrupted (SIGINT/SIGTERM → graceful stop: advertises a
disabled capability so the server stops routing, then exits 0). While watching it
publishes a **presence heartbeat on every poll**, so it appears as a **`live`**
executor to the requester (mobile / GUI) and jobs route to it immediately — not
merely `queued`.
- `--provider <claude|gemini|codex>` (optional; else the first ready provider)
- `--poll <seconds>` — the **idle baseline** (default 15, min 3). The loop is
  adaptive: after a poll that sees work it tightens to a ~3s burst; on errors it
  backs off exponentially (capped 60s, kept under the server's ~90s presence-stale
  window so a recovered run is re-marked `live` on the next poll).
- `--language <lang>` (output-language fallback; default `auto`)
```bash
sa executor --watch --provider claude --poll 30
```

### `executor --providers` — ✅ detect only
Probe installed provider CLIs and report `{ id, available, authenticated, version }`
for each — no server call, no registration. Use this to confirm readiness before
`--watch`.
```bash
sa executor --providers
```

## Available now (server commands)

### `status` (default)
Print version, auth, and the `features` capability map.
```bash
sa status
sa status --format text
```

### `archive` — ✅
Submit a URL for archiving. Returns `data.jobId` + `data.status`.
- `--url <url>` (required)
- `--mode <queue|sync|fetch>` (default `queue`)
- `--media <all|images|none>` (default `all`; `images` treated as `all` on desktop)
- `--transcript` (request transcription)
- `--comments`, `--formattedTranscript`, `--wait` (accepted; see limits)
- `--tags <a,b>`, `--comment <text>` — **ignored in v1** (local-note features)
```bash
sa archive --url="https://www.instagram.com/p/example/"
sa archive --url="https://x.com/u/status/1" --transcript
```

### `job` — ✅
Inspect one job by id. Returns `status` / `error` / `progress`.
- `--id <job-id>` (required)
- `--source <local|server|auto>` (default `auto`; desktop CLI resolves via server)
```bash
sa job --id="<jobId>"
```

### `tags` — ✅
List tag definitions from the server (`fetchUserTags`): `data.tags[]` of
`{ name, color? }` plus `data.count`. `--counts` is accepted but per-tag counts
are not in this endpoint and stay unpopulated for now.
```bash
sa tags
```

### `search` — ✅
Server-side per-user substring search over your OWN archives. Returns **snippets
only** (never full bodies), newest-first. One-off lookups; for repeated analysis
over the same corpus prefer `export` + local `grep` (cheaper after the one pull).
Feature-gated server-side (`SERVICE_NOT_READY` when disabled).
- `--q <text>` (required; 2–128 chars; substring, ASCII case-insensitive; CJK works)
- `--limit <n>` (1–50, default 20)
- `--platform <p>` / `--platforms <p1,p2>` (index-backed pre-filter)
- `--since <ISO>` / `--until <ISO>` (archived-date bounds; `since` inclusive, `until` exclusive)
- `--match <csv>` (subset of `content,title,author,url`; default `content,title,author`)
- `--cursor <cursor>` (pagination; pass back `data.nextCursor`)

`data` = `{ query, match, results[], hasMore, nextCursor, searchedRows, scanCap, truncated }`;
each result = `{ archiveId, platform, url, title, author, archivedAt, snippet, matchedField }`.
```bash
sa search --q "react state" --limit 10
sa search --q "양자컴퓨팅" --platforms x,reddit --since 2026-01-01T00:00:00Z
```
> Big libraries: one search scans the most-recent candidate window (capped). When
> `truncated` is true, keep paging with `nextCursor`, or narrow with
> `--platform(s)`/`--since`/`--until` so the scan stays index-bounded.

### `subscribe` — ✅
Create a server-backed subscription from a public profile/feed URL. The CLI uses
the server target resolver first, then creates the subscription.
- `--url <url>` (required)
- `--hour <0-23>` (optional; overrides the local cron to `0 <hour> * * *`)
- `--folder <workspace-path>` (optional destination folder metadata)
- `--naverSubscriptionType <blog|cafe-member>` (optional Naver metadata)
- `--naverCookie <base64>` is accepted for shared CLI parity but ignored on
  desktop; the raw cookie is never transmitted.
```bash
sa subscribe --url="https://x.com/alice" --hour 9
sa subscribe --url="https://blog.example.com/feed.xml" --folder "Social Archives/Subscriptions"
```

Response `data` includes `{ subscriptionId, platform, handle, cron, folder,
naverCookieApplied }`; a warning is emitted when `--naverCookie` is supplied.

### `post` — ✅
Create a server-backed composed post from a local Markdown file.
- `--path <file.md>` (required on desktop; absolute or relative filesystem path)
- `--active` is GUI/Obsidian-only and returns `SERVICE_NOT_READY` on desktop
```bash
sa post --path ./draft.md
```

The file's YAML frontmatter is read for `clientPostId`, `author`, `authorHandle`,
and optional link-preview fields; the Markdown body becomes the server
`fullContent`. If no `clientPostId` exists, the desktop CLI derives a stable
`cli_<sha256>` id from the file path so re-running is idempotent. Response `data`
includes `{ path, postId, archiveId, postedAt, mediaCount }`.

### `share` — ✅
Create a public share URL and sync it back to the server archive record.
- `--path <file.md>` (required on desktop)
- `--reader` returns the reader-mode URL (`#reader`)
- `--active` is GUI/Obsidian-only and returns `SERVICE_NOT_READY` on desktop
```bash
sa share --path ./workspace/exported-archive.md --reader
sa share --path ./draft.md
```

If the file has `archiveId`, `sourceArchiveId`, or
`social_archiver_server_archive_id` frontmatter, that server archive is shared.
If no server archive id is present, the CLI first runs the same composed-post
path as `post`, then shares the created archive. Response `data` includes
`{ path, shareId, shareUrl, archiveId, shareUrlCopied:false }`.

### `author-notes` — ✅
Desktop-specific interpretation: seed/upsert editable **server author profiles**
from recent archives. It does not create Obsidian vault author-note Markdown
files.
- `--dryRun` reports the author keys that would be upserted
- `--limit <n>` scans up to `n` recent archives (capped to 100 per run)
```bash
sa author-notes --dryRun --limit 50
sa author-notes --limit 50
```

Response `data` matches the shared shape `{ created, skipped, failed, paths }`,
where `paths` are server author keys such as `x:url:https://x.com/alice`.

### `transcribe` — ✅ (requester)
Queue a transcription job for an archive that has audio/video (e.g. YouTube,
TikTok, or a post with attached media). The CLI fetches the archive, resolves its
transcribable media, runs the **availability handshake** (is a transcription
executor online + capable?), then creates the job. An **executor** runs it — the
desktop app today; poll progress with `job --id`. This requester does not produce
the transcript itself.
- `<archiveId>` (positional, required)
- `--mode <download-only|download-and-transcribe|transcribe-existing-media>`
  (optional; default auto — `transcribe-existing-media` when the archive already
  has media, else `download-and-transcribe` for a downloadable source)
- `--language <lang>` (optional output/transcription language hint)
- `--model <name>` (optional requested Whisper model)
- `--run` — register THIS process as a transcription executor and run the job
  **inline** (yt-dlp downloads the media, Whisper transcribes it), so no separate
  executor is needed. Requires **yt-dlp + ffmpeg + a Whisper backend** installed
  locally (presence-checked — never reads keys); else `SERVICE_NOT_READY` with
  `error.details.status` (`yt_dlp_missing` / `ffmpeg_missing` / `whisper_missing`)
  + `details.tools`. `--run` effectively serves `download-and-transcribe` (a
  headless process has no pre-downloaded local media for `transcribe-existing-media`).
- `--doctor` — **diagnose only** (offline; no `<archiveId>`, no auth). Detects
  yt-dlp / ffmpeg / ffprobe / Whisper, reports which modes this machine can run,
  and prints copy-paste install commands for whatever is missing. Installs/runs
  **nothing** — ffmpeg/Whisper need a system package manager, so it only surfaces
  the commands. `--format text` prints a human-readable checklist; default JSON
  returns `{ os, tools[], whisperBackends[], supportedModes, ready, summary, nextSteps }`.

`data` = `{ jobId, status, mode, mediaKind, executor: { live, status } | null,
delivery: { liveDispatched, queued }, note }` (+ `ranLocally` + `tools` with
`--run`). Without an executor online the command returns `SERVICE_NOT_READY`
(retryable) with `error.details.status` (e.g. `no_executor`, `whisper_missing`);
an archive with no transcribable media returns `INVALID_ARGUMENT`.
```bash
sa transcribe --doctor --format text                       # check local tools before --run
sa transcribe Et4GOQVVKR                                   # queue for the desktop app, then:
sa job --id="<jobId>"                                       # poll to completion
sa transcribe Et4GOQVVKR --mode download-and-transcribe --language en
sa transcribe Et4GOQVVKR --run                             # download + transcribe inline (needs local tools)
```
> `--run` mirrors `ai-comment --run`: one process registers, queues, and drains
> the job. If the desktop GUI is the active executor it may claim the job first —
> then `ranLocally:false` and the GUI finishes it.

---

## Defined but NOT yet wired (return `SERVICE_NOT_READY`)

These are part of the shared surface and will light up in later phases. Some need
the desktop GUI's local SQLite store or sync engine; others still need a
desktop-safe service adapter.

### `jobs` / `jobs:check`
List jobs (`--status`, `--limit`) / run pending-job catch-up (`--syncServer`).
Need the local job store.

### `sync`
Run sync tasks (`--target <subscriptions|library|pending|all>`, `--syncServer`).
Reconciles the local SQLite store — unavailable headless.

### `tag-create` / `tag-apply`
Create a tag (`--name`, `--color`) / add·remove·toggle a tag on a note
(`--path`, `--tag`, `--action <add|remove|toggle>`). Need local TagRepository.

### `profile-crawl`
Crawl a profile/RSS now (`--url`, `--count`, `--range`, `--subscribe`, …).

### `import-instagram` / `import-job` / `import-control`
Instagram Saved ZIP import (`--files`, `--destination`, `--preflight`, …),
inspect (`--id`, `--items`), control (`--id`, `--action <pause|resume|cancel>`).

### `media`
Media re-download·detach (`--path` or `--active`, `--action`). (The desktop
`transcribe` requester is wired — see "Available now" above.)

### `ai-comments` / `ai-providers`
List a note's AI comments (`--path`) / list installed AI CLI providers + auth
status through the shared cli-core command path. Use the desktop `ai-comment`
workspace command and `executor` for available AI job flows today.

---

For the response envelope, error codes, redaction, and billing policy see
`output-schema.md`.
