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

Flag definitions are the shared `cli-core` set (`desktop-app/src/lib/cli/core/flags.ts`),
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
```bash
sa export --dir ./workspace --limit 50
grep -ril "keyword" ./workspace      # find by content (0 server calls)
# then read/analyze the matched .md files directly
```
Read-only. Prefer this for find/analyze; reserve server calls for mutations
(which should be batched). Re-running overwrites by filename (idempotent).

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

### `ai-comment` — ✅ queues a job (run it with `executor`)
`ai-comment <file.md> --type <summary|factcheck|critique|keypoints|sentiment|connections|translation|glossary|reformat|custom> [--provider <claude|gemini|codex>] [--language <lang>]`.
Availability handshake → `createAICommentJob`; returns a `jobId`. The comment is
produced by a separate executor (the desktop GUI, or `executor --watch` — see
below), NOT this CLI — returns `SERVICE_NOT_READY` if no executor is available.

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

Registers this machine as a `tauri-desktop` executor, then claims AI-comment /
AI-action jobs and runs a provider CLI (`claude` / `gemini` / `codex`) locally —
so `ai-comment` completes without the GUI. Output is **NDJSON** (`--format json`,
default): `{event,…}` progress lines plus a terminal `CliResponse`. `node:*` and
the provider subprocess stay in the cli/ Node layer; provider auth is checked by
**presence only** (never reads key contents).

### `executor` — ✅ one-shot
Register, drain the currently-available job backlog to completion, then exit.
Requires an authenticated account **and** a ready provider; else `AUTH_REQUIRED`
or `SERVICE_NOT_READY`.

### `executor --watch` — ✅ loop
Poll + run jobs until interrupted (SIGINT/SIGTERM → graceful stop: advertises a
disabled capability so the server stops routing, then exits 0).
- `--provider <claude|gemini|codex>` (optional; else the first ready provider)
- `--poll <seconds>` (default 15, min 3)
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

---

## Defined but NOT yet wired (return `SERVICE_NOT_READY`)

These are part of the shared surface and will light up in later phases. They need
the desktop GUI's local SQLite store or sync engine and are GUI-only headless.

### `jobs` / `jobs:check`
List jobs (`--status`, `--limit`) / run pending-job catch-up (`--syncServer`).
Need the local job store.

### `sync`
Run sync tasks (`--target <subscriptions|library|pending|all>`, `--syncServer`).
Reconciles the local SQLite store — unavailable headless.

### `tag-create` / `tag-apply`
Create a tag (`--name`, `--color`) / add·remove·toggle a tag on a note
(`--path`, `--tag`, `--action <add|remove|toggle>`). Need local TagRepository.

### `profile-crawl` / `subscribe`
Crawl a profile/RSS now (`--url`, `--count`, `--range`, `--subscribe`, …) /
create a subscription (`--url`, `--hour`, `--folder`, …).

### `import-instagram` / `import-job` / `import-control`
Instagram Saved ZIP import (`--files`, `--destination`, `--preflight`, …),
inspect (`--id`, `--items`), control (`--id`, `--action <pause|resume|cancel>`).

### `post` / `share`
Post a note to the timeline / post + create a share URL (`--path` or `--active`,
`--reader`). `--active` is GUI-only.

### `transcribe` / `media`
Batch transcription control (`--mode`, `--action`) / media re-download·detach
(`--path` or `--active`, `--action`).

### `author-notes`
Create/update author notes (`--dryRun`, `--limit`).

### `ai-comment` / `ai-comments` / `ai-providers`
Generate an AI comment (`--path`, `--type`, `--provider`, `--prompt`,
`--language`, `--outputLanguage`) / list a note's AI comments (`--path`) / list
installed AI CLI providers + auth status. Executor wiring is a later phase.

---

For the response envelope, error codes, redaction, and billing policy see
`output-schema.md`.
