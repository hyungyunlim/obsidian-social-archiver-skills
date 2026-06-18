---
name: social-archiver-desktop-cli
description: Use when an agent needs to drive the Social Archiver DESKTOP app headlessly through its standalone Node CLI — archive a social/web URL, search your archived posts, bookmark posts (move them between Inbox and Archived), subscribe to a public profile/feed, post/share a local Markdown file, seed author profiles, check archive jobs, read account/capability status, or run the headless AI-job executor (or run an AI comment inline) — without the desktop GUI running. Triggers on phrases like "archive this link with the desktop app", "social archiver desktop cli", "headless archive", "queue an archive job", "search my archives", "find an archived post", "bookmark this archive", "move posts out of the inbox", "triage my inbox", "subscribe with desktop cli", "post this markdown", "share this archive", "author-notes", "check archive job status", "social-archiver status", "run the executor", "executor --watch", "process AI comment jobs headlessly", "ai-comment --run", "process translation variant jobs headlessly", or "content.translate_variant". For the Obsidian-plugin variant (driving a running Obsidian vault), use the `obsidian-social-archiver-cli` skill instead.
---

# Social Archiver Desktop CLI

This skill teaches agents to drive the Social Archiver **desktop** app through its
standalone Node CLI (`social-archiver`). Unlike the Obsidian CLI — which talks to
a *running* Obsidian process — this is a **separate Node process** that calls the
Workers API directly. The desktop GUI does **not** need to be open.

Commands mirror the Obsidian CLI surface and return the same JSON envelope when
run with the default `format=json`. cli-core is shared host-agnostic code; the
desktop host wraps the real `DesktopApiClient`.

> Status: server-backed commands + a local workspace + a headless executor are
> live. **Server-wired:** `status`, `archive`, `job`, `search` (per-user substring
> search → snippets), `subscribe`, `post`, `share`, `tags`, `bookmark` (bulk
> Inbox ↔ Archived state), and `author-notes`. **Local workspace** (pull a corpus
> to `.md`, then classify / comment / sync back): `export` (with an `--archived`
> Inbox/Archived filter), `tag`, `note`, `push`. **AI jobs:** `ai-comment` queues
> a job that an executor runs — the GUI, `executor --watch` (headless; claims jobs
> and runs a provider CLI locally, showing up as a `live` executor), or
> `ai-comment --run` to queue **and** run it inline in one process. The desktop
> executor advertises `content-translate-v1` for `content.translate_variant` only;
> tag patches and other content variants (e.g. `content.reformat_variant`) are
> left for an Obsidian executor or Cloud AI. `author-notes` on desktop seeds
> server author profiles; it does not create Obsidian vault author-note files.
> Remaining commands are defined but return `SERVICE_NOT_READY` — see "Command
> availability" below. This doc states what works today; do not invoke a command
> marked not-yet-wired and expect a result.

See `references/commands.md` for the full catalog and `references/output-schema.md`
for the envelope, error codes, and redaction rules.

## Prerequisites

1. Two ways to run it:
   - **Packaged (recommended):** the desktop app bundles the CLI. Install it onto
     PATH from the app's **Settings → Command line → Install ‘sa’ command**, then
     run **`sa <command>`** anywhere (the canonical `social-archiver <command>`
     also works). The binary is self-contained — no Node needed. `sa` installs to
     `~/.local/bin`; on a normal PATH it wins over the niche Unix `sa(8)`
     accounting tool (still reachable as `/usr/sbin/sa`). The app won't overwrite
     a `sa` file you put there yourself, and tells you if a `sa` earlier on your
     PATH still shadows it (then use `social-archiver`).
   - **From source (dev):** `cd desktop-app && npm install`, then
     `npm run cli -- <command> [--flags]` (where this doc shows `sa <command>`,
     the dev equivalent is `npm run cli -- <command>`). Node 18+.
2. **Auth — usually automatic.** If the desktop app is installed and signed in,
   the CLI **borrows its account automatically** (it reads the app's own token
   store), so **no separate login is needed**. Override / set it explicitly only
   when you need a different account or a headless machine:
   - **env (CI):** `SOCIAL_ARCHIVER_TOKEN` (+ optional `SOCIAL_ARCHIVER_CLIENT_ID`).
   - **explicit file:** `social-archiver login --token <token>` (CI), or
     `social-archiver login` (interactive device-code: shows a code + QR, approve
     on your phone or a signed-in desktop app). `logout` removes it.
   Precedence: env → `login` file → desktop app account → unauthenticated. Set
   `SOCIAL_ARCHIVER_NO_DESKTOP_CREDENTIALS=1` to ignore the desktop account.
   With no token, commands still run but report `authenticated: false` and
   auth-gated calls fail closed. (Agents on a machine with a signed-in desktop
   app need no auth setup; otherwise prefer `--token` / env over the interactive
   flow, which needs a human to approve.)
4. `--host=mock` runs an in-memory host (no backend, no token) for testing.

If a prerequisite is missing, surface it and stop. Do not attempt to log in or
write credentials from the CLI.

## Scope, limits & disclaimer

Read this before archiving on a user's behalf — these are hard constraints, not
preferences.

- **Permission & ethics.** ⚠️ *Archive only content you have permission to save.*
  Respect copyright, privacy, and each platform's terms. Do not mass-archive or
  scrape third parties without a lawful basis. When a user asks you to archive
  someone else's content, surface this and let them confirm.
- **Public content only.** Social Archiver can only archive **public** profiles
  and **public** posts. Private, follower-only, or login-walled content returns a
  **terminal** error (e.g. `PRIVATE_CONTENT` / `NOT_FOUND`) with `retryable: false`
  — there is **no bypass**. Do not retry it, and never try to supply cookies or
  credentials to reach gated content.
- **Credits.** Monthly allotment by tier: **free 10**, **pro 500**, **beta-free /
  admin unlimited**; the free/pro counters reset at the start of each billing
  month. Most archives run through free direct scraping and cost **0 credits** —
  only paid fallback (BrightData) and AI analysis / deep research consume them.
  Trust the server's `creditsRequired` / `error` over any local estimate. On
  `INSUFFICIENT_CREDITS` or `PAYWALL_REQUIRED`, **stop** and surface the billing
  fallback message verbatim: upgrade / restore happens on the **mobile app** with
  the same account (or a license key). **Never attempt a purchase from the CLI.**
- **Rate limits.** Enforced server-side (the enforcement mode is server-controlled
  and may change). Documented per-tier limits: archive create **5/min free ·
  20/min pro** (burst **2 / 6 per 10s**), general API **30 / 90 RPM**, job polling
  **120 / 240 RPM**, concurrent archive jobs **1 / 2**. On `RATE_LIMITED`, honor a
  `Retry-After` if present, otherwise back off exponentially — never tight-loop.
  The polling limits are generous, but a 1s poll will still trip them; use the
  backoff in "Default workflow" step 2.
- **Secrets.** Never print, log, or echo tokens, API keys, cookies, or
  `Authorization` headers (see "Default workflow" step 4). Provider auth is checked
  by **presence only**; keys are never read or transmitted.

## Default workflow

Always pass `format=json` is the default; never parse free-form text. Parse
`ok`, and on failure `error.code` + `error.retryable`.

1. Probe readiness:
   ```
   sa status
   ```
   Confirm `data.authenticated === true` and that the `data.features` you need
   are `true` (for example `features.archive`, `features.subscribe`,
   `features.post`, `features.share`, or `features.authorNotes`).

2. Submit long work and poll. `archive` returns a `jobId` quickly:
   ```
   sa archive --url="https://x.com/u/status/1"
   # read data.jobId, then poll:
   sa job --id="<jobId>"
   ```
   Use **exponential backoff** (3s, 6s, 12s, 24s; cap ~6 iterations / ~90s, more
   only for BrightData-backed platforms or transcription). `job` returns
   `status` / `error` / `progress`. Stop on a terminal `status` (`completed`,
   `failed`, `cancelled`).

3. **Find / analyze archived content.** Two paths — pick by how much you'll
   search:
   - **One-off lookup → `search`** (server-side, returns snippets only):
     ```
     sa search --q "react state" --limit 10
     sa search --q "양자컴퓨팅" --platforms x,reddit --since 2026-01-01T00:00:00Z
     ```
     `--q` is required (2–128 chars, substring, recency-ordered). Results carry
     `archiveId` + a highlighted `snippet`; page with `nextCursor`. For a big
     library, narrow with `--platform(s)`/`--since`/`--until` (those use indexes).
   - **Repeated analysis over the same corpus → `export` + local `grep`** (one
     paginated pull, then unlimited local search at 0 server cost):
     ```
     sa export --dir ./workspace --limit 100
     grep -ril "topic" ./workspace
     ```
   Each exported file's frontmatter carries `archiveId` (the join key for
   write-back). Reserve server calls for mutations, and batch them.

   To push edits back, change a file's **frontmatter** (the `tags:` list,
   `liked:`, `bookmarked:`) and run `push` — it diffs against the server and
   pushes only what changed. Always `--dry-run` first to preview:
   ```
   sa push ./workspace --dry-run   # preview the plan
   sa push ./workspace/2024-x.md   # apply one file's edits
   ```
   `push` skips files with a missing/unknown `archiveId` and is frontmatter-only;
   free-form body edits are not written back (use `note` for personal notes).
   Tags are **add-only** — push never removes a tag by its absence from the list;
   to remove a tag use `tag <file> --remove <t>`.

4. Respect capability gating. A `SERVICE_NOT_READY` error means the command is
   not available on this host (not yet wired, or it needs the desktop GUI's local
   store). Do not blindly retry — surface it to the user.

4. Never print, log, or echo `authToken`, cookies, `Authorization` headers, API
   keys, or share passwords. The envelope redacts these, but do not defeat it.

5. On `INSUFFICIENT_CREDITS` or `PAYWALL_REQUIRED`, surface the billing fallback
   message verbatim (upgrade/restore on the mobile app with the same account, or
   apply a license key). Do **not** attempt any purchase from the CLI.

## Command availability (current scaffold)

| Command | Status |
| --- | --- |
| `status` | ✅ wired (server: verifyToken) |
| `archive` | ✅ wired (server submit → `jobId`) |
| `job` | ✅ wired (server: getJobStatus → status/error/progress) |
| `subscribe` | ✅ wired (server resolver → create subscription; `--naverCookie` ignored, not transmitted) |
| `post` | ✅ wired (local Markdown `--path` → server composed post; `--active` is GUI-only) |
| `share` | ✅ wired (exported archive `archiveId` or local Markdown → server share URL; `--reader` appends `#reader`) |
| `tags` | ✅ wired (server: fetchUserTags → names + colors; `--counts` not yet populated) |
| `author-notes` | ✅ wired (server author-profile seed/upsert from recent archives; `--dryRun` previews keys) |
| `search` | ✅ wired (server: per-user substring search over your archives → snippet results; `--q` required; flag-gated server-side). One-off lookups; use `export`+grep for repeated analysis |
| `bookmark` | ✅ wired (server bulk-actions: set the **Archived** state — `bookmark --ids id1,id2` moves posts out of the Inbox; `--off` moves them back; chunked ≤200/req) |
| `export` | ✅ workspace: materialize archives to local `.md` (find/analyze, 0 server calls); `--archived false` = Inbox-only, `--archived true` = Archived-only |
| `tag` | ✅ workspace: classify by file → server `upsertTags`/`upsertArchiveTags` (batched) |
| `note` | ✅ workspace: append a personal note by file → server `updateNotes` |
| `push` | ✅ workspace write-back: diff a file's frontmatter (tags/liked/bookmarked) → server; `--dry-run` to preview |
| `ai-comment` | ✅ workspace: queues an AI job — completes when an executor runs (`executor --watch` or the GUI), else `SERVICE_NOT_READY`. **`--run`** registers this process as a one-shot executor + runs it inline (needs a local provider CLI), so no separate `executor --watch` is needed |
| `executor` | ✅ headless: claim + run server AI-comment jobs plus `content.translate_variant` AI actions locally via a provider CLI (`--watch` to loop; bare = one-shot drain; `--providers` to detect only) |
| `transcribe` | ✅ requester + inline executor: `transcribe <archiveId> [--mode …]` resolves the archive's audio/video + availability handshake → queues a job for an online executor (the desktop app); poll with `job`. **`--run`** registers this process as a transcription executor and runs it inline (yt-dlp download + Whisper) — needs yt-dlp/ffmpeg/Whisper installed locally. **`--doctor`** diagnoses those local tools (offline) + prints install commands for what's missing |
| `jobs`, `jobs:check`, `sync` | ⛔ need local SQLite/sync engine (GUI-only) |
| `tag-create`, `tag-apply` | ⛔ cli-core path-based; superseded on desktop by `tag` |
| `profile-crawl`, `import-*`, `media`, `googlemaps`, `ai-comments`, `ai-providers` | ⛔ defined; not yet wired |

`archive` v1 limits: `--tags` / `--comment` are local-note features not in the
server submit and are ignored; `--media=images` is treated as `--media=all`.

## Headless executor (run AI jobs locally)

`ai-comment` only *queues* a job — something must **run** it. The desktop GUI is
one executor; `executor --watch` is the headless one. It registers this machine
as a `tauri-desktop` executor, then claims jobs and runs a provider CLI
(`claude` / `gemini` / `codex`) locally — so an agent can complete `ai-comment`
end-to-end with no GUI open. It also claims `content.translate_variant` AI
actions and uploads the result as a server content variant. It deliberately does
not claim tag-patch actions or broad content-variant work such as
`content.reformat_variant`; those should route to an Obsidian executor or Cloud
AI.

```bash
# 1. Confirm a provider CLI is installed + signed in (presence only — never reads keys):
sa executor --providers
#    → { providers: [ { id:"claude", available:true, authenticated:true, version:"…" }, … ] }

# 2. Run the loop (Ctrl-C to stop). Streams NDJSON: registered → claimed → completed.
#    While watching, this executor shows up as LIVE to the requester (each poll
#    doubles as a presence heartbeat) and the cadence is adaptive — see below.
sa executor --watch [--provider claude] [--poll 15]

# 3. One-shot: drain whatever is queued right now, then exit.
sa executor
```

- Requires an authenticated account (`login`) **and** at least one provider CLI
  that is available + authenticated; otherwise it reports `SERVICE_NOT_READY`
  (no provider) or `AUTH_REQUIRED` (no token) and exits non-zero.
- `--format json` (default) emits **NDJSON** — one JSON object per line:
  `{event,…}` progress lines (`registered`, `claimed`, `completed`, `failed`,
  `poll`) followed by a terminal `CliResponse` envelope. Parse line-by-line.
- **`--watch` is adaptive + live.** `--poll` (default 15s) is only the *idle
  baseline*; after a poll that sees work the loop tightens to a ~3s burst, and on
  errors it backs off exponentially (capped 60s). Each poll doubles as a presence
  heartbeat, so a watching executor reports as **`live`** (not merely `queued`) to
  the requester (mobile / GUI) and jobs route to it immediately. Keep the baseline
  under ~90s or the server marks the executor stale.
- Provider auth is checked by **presence only** (an env var or `~/.<cli>` config
  dir). Keys are never read or transmitted.
- Typical agent flow: `ai-comment <file> --type summary` to queue, then (on a
  machine with a provider CLI) `executor --watch` to run it; the comment is
  appended server-side and syncs back to every device.

## Examples

```bash
# Readiness
sa status

# Archive + poll
sa archive --url="https://www.instagram.com/p/example/"
sa job --id="<jobId>"

# Transcribe a video archive (queues a job for the desktop executor; poll it)
sa transcribe <archiveId> --mode download-and-transcribe
sa job --id="<jobId>"
# …or run it inline here (needs yt-dlp + ffmpeg + Whisper installed locally)
sa transcribe <archiveId> --run

# Subscribe / post / share
sa subscribe --url="https://x.com/alice" --hour 9
sa post --path ./draft.md
sa share --path ./workspace/exported-archive.md --reader

# Seed server author profiles from recent archives (no vault files are created)
sa author-notes --dryRun --limit 50
sa author-notes --limit 50

# Compact output
sa status --format text

# Detect provider CLIs, then run the headless executor
sa executor --providers
sa executor --watch --provider claude

# Offline demo (no backend/token)
sa status --host=mock
```

## Error handling

The envelope is `{ ok: true, ... }` or `{ ok: false, error: { code, message, retryable, details? } }`.
Retryable codes are safe to retry with backoff; non-retryable codes mean stop and
report. Always trust the `retryable` field over any table; the server may
override. Full code table in `references/output-schema.md`.

## Pointers

- Full command catalog + flags: `references/commands.md`
- Envelope, error codes, redaction, billing fallback: `references/output-schema.md`
- Spec: `docs/specs/desktop-cli-agent-skill-prd.md`
- Implementation: `desktop-app/src/lib/cli/` (cli-core + hosts) and `desktop-app/cli/` (binary).
