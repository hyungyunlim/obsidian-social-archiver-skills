---
name: obsidian-social-archiver-cli
description: Use when an agent needs to archive social or web content into Obsidian, ingest selected TweetClaw/X source packs, post vault notes to the Social Archiver timeline, create or edit Social Archiver vault Markdown directly, generate or inspect AI comments on archived posts, inspect Social Archiver jobs, import Instagram Saved exports, sync Social Archiver data, manage tags on Social Archiver notes, or operate the Obsidian Social Archiver plugin through Obsidian CLI. Triggers on phrases like "archive this link", "save to obsidian", "post to timeline", "archive these TweetClaw results", "add an AI comment", "comment on this archive", "edit social archive markdown", "check archive job", "import instagram saved", "social archiver".
---

# Obsidian Social Archiver CLI

This skill teaches agents how to drive the Social Archiver Obsidian plugin through the Obsidian CLI, and how to make safe direct Markdown edits in a vault when the task is file-local. CLI commands are namespaced under `social-archiver` and return JSON when `format=json` is passed.

See `references/commands.md` for the full command catalog, `references/output-schema.md` for the response envelope, error codes, and redaction rules, and `references/vault-markdown.md` for the direct vault Markdown contract.

## Prerequisites

1. Obsidian 1.12.7+ installer is running on the machine. The Obsidian app must be open — the CLI talks to the running Obsidian process.
2. Social Archiver plugin is installed and enabled in the target vault.
3. The user is authenticated in the plugin (magic link or license key flow completed).
4. Obsidian CLI is enabled in Obsidian Settings → General → Command line interface.
5. The `obsidian` binary is on `PATH`. Verify with `obsidian help`.

If any prerequisite is not met, surface the issue to the user and stop. Do not attempt to log in or alter settings from CLI.

## Discovery

- `obsidian help` lists every CLI command registered by Obsidian and its plugins.
- `obsidian help social-archiver` and `obsidian help social-archiver:<action>` show flag descriptions for a specific command.

If the `social-archiver` commands do not appear in `obsidian help`, either the plugin is not loaded, the Obsidian version is too old, or the user must restart Obsidian.

## Default workflow

Run every command with `vault=<vault>` first and `format=json` last (or anywhere — but always include it).

1. Probe readiness:
   ```
   obsidian vault=<vault> social-archiver format=json
   ```
   Confirm `ok: true`, `data.authenticated === true`, and the feature flags you need are `true`.

2. Always pass `format=json`. Never parse free-form text output.

3. For long-running work (archive, profile crawl, import), use the default `mode=queue` (or equivalent). The command returns a `jobId` quickly.

4. Poll to terminal status (token-efficient pattern):
   - **Do NOT call `jobs:check` every iteration.** The plugin's `PendingJobOrchestrator` already processes queued jobs automatically in the background. `jobs:check` only triggers a one-shot drive — useful at the very start of a session or if the orchestrator appears stuck.
   - Poll directly with `obsidian vault=<vault> social-archiver:job id=<jobId> format=json` (defaults to `source=local`).
   - Expected completion times by platform:
     - Bluesky, Mastodon, Threads (via Fediverse direct): ~2-5s
     - Reddit, Pinterest, YouTube (direct or RSS): ~5-10s
     - Instagram, X.com, Facebook, LinkedIn, TikTok (via BrightData): ~15-60s
     - Naver Blog/Cafe, Brunch (local fetch): ~10-30s
   - Use **exponential backoff**: wait 3s, then 6s, then 12s, then 24s. Cap at ~6 iterations (~90s total) for most platforms; agents may extend to 8-10 iterations only for BrightData-backed platforms or transcription jobs.
   - If `data.status` is `completed`, `failed`, or `cancelled` → stop.
   - If the bound expires without a terminal status → stop polling and surface the latest status. Do not loop forever.

   *Why fire-and-forget on writes?* Obsidian 1.12.7 CLI loses handler output when the handler awaits real I/O. Commands that touch the network (`jobs:check`, `sync`, `profile-crawl`, `subscribe`, `import-*`, `share`, `post`, `media`) schedule the work and return immediately. Observe outcomes by polling local state with read-only commands (`job source=local`, `jobs`, `tags`, etc.).

5. Never print, log, or echo `authToken`, `cookie`, `naverCookie`, `Authorization` headers, BrightData/Perplexity/Gumroad API keys, or share passwords. Strip them from any object you display to the user.

6. On `INSUFFICIENT_CREDITS` or `PAYWALL_REQUIRED` errors, surface the billing fallback message verbatim — it instructs the user to upgrade or restore on the mobile app, or to apply a license key in plugin settings. Do **not** attempt to purchase anything from CLI. The plugin cannot accept direct payment under store policy.

## Timeline posts and comments

Use `social-archiver:post` when the user wants an existing vault note to appear in the local Social Archiver timeline. Pass either `path=<vault-path>` or `active`; if the user wants a public share link, use `social-archiver:share` instead because it posts the note and creates the share URL.

Use `social-archiver:ai-comment` when the user asks to add analysis, summary, critique, fact-check, translation, reformatting, or a custom AI response as a comment on a specific archived note. Check available desktop AI providers first with `social-archiver:ai-providers`, then schedule the comment and observe completion with `social-archiver:ai-comments path=<vault-path>`. AI comments are desktop-only and require at least one authenticated local CLI (`claude`, `gemini`, or `codex`).

For a personal note while archiving a new URL, use `social-archiver:archive ... comment=<text>`. For adding or editing a non-AI personal note on an existing archive, the current CLI has no dedicated command; do not pretend `ai-comment` is a manual note editor.

## Direct vault Markdown edits

If the user asks for a timeline post or a comment and the operation can be represented as Markdown/frontmatter, the Obsidian CLI is optional. Prefer direct vault edits when the target note is already known, when the user gives a vault path, or when Obsidian CLI is unavailable but filesystem access is available.

Read `references/vault-markdown.md` before creating or editing files directly. It covers how to resolve `archivePath`, find notes by vault path, `sourceArchiveId`, or `originalUrl`, create `platform: post` timeline documents, set personal-note `comment` frontmatter, append parseable `## AI Comments`, and preserve platform comments under `## 💬 Comments`.

Use the CLI instead of direct Markdown for work that requires network fetches, media download, server sync, share URL creation, billing/auth state, queued jobs, imports, or plugin settings changes.

## TweetClaw/X Source Packs

When the user provides TweetClaw results, exports, or X/Twitter source packs,
read `references/tweetclaw-x-source-pack.md` before archiving.

Treat TweetClaw output as upstream source selection only. Archive selected
canonical X URLs with `social-archiver:archive`, preserve capture metadata in
`tags` and `comment`, and use `ai-comment` or direct vault Markdown only after
the Social Archiver note exists.

Do not call TweetClaw from this skill. Do not scrape, post, reply, send DMs,
schedule posts, operate accounts, run browser automation, or call X/Twitter
platform APIs from this skill. Ask the user to provide the source pack or URLs.

## Examples

### 1. Single archive + poll

```bash
# Submit (returns jobId immediately)
obsidian vault="Research" social-archiver:archive \
  url="https://www.instagram.com/p/example/" \
  mode=queue format=json

# read data.jobId from the response, e.g. job-1778840000000

# Poll with exponential backoff (3s, 6s, 12s, 24s, ...). Stop on terminal status.
# The background orchestrator processes the queue automatically — you do NOT
# need to call jobs:check each iteration.
obsidian vault="Research" social-archiver:job \
  id="job-1778840000000" format=json
```

*(Only call `social-archiver:jobs:check` once at session start, or if the orchestrator appears stuck — e.g. a job sits at `pending` with `retryCount=0` for >30s.)*

### 2. Profile crawl with subscribe

```bash
obsidian vault="Research" social-archiver:profile-crawl \
  url="https://www.threads.net/@example" \
  count=20 range=30d subscribe hour=9 format=json
```

### 3. Instagram preflight then import

```bash
# Preflight (does not start a job)
obsidian vault="Research" social-archiver:import-instagram \
  files="/Users/me/Downloads/instagram_saved.zip" \
  preflight format=json

# Start the import
obsidian vault="Research" social-archiver:import-instagram \
  files="/Users/me/Downloads/instagram_saved.zip" \
  destination=inbox tags="instagram,saved" format=json

# Poll job status
obsidian vault="Research" social-archiver:import-job \
  id="<importJobId>" items format=json
```

### 4. Tag apply (add / remove / toggle)

```bash
obsidian vault="Research" social-archiver:tag-apply \
  path="Social Archives/Instagram/2026/05/example.md" \
  tag="favorites" action=add format=json
```

### 5. Sync everything (with server catch-up)

```bash
obsidian vault="Research" social-archiver:sync \
  target=all syncServer=true format=json
```

The response lists which sub-targets ran versus were skipped (server pending-job catch-up runs only if the user setting `enableServerPendingJobs` is enabled).

### 6. Post an existing note to the timeline

```bash
obsidian vault="Research" social-archiver:post \
  path="Notes/My Thoughts.md" format=json

# Or use the active note in the running Obsidian window.
obsidian vault="Research" social-archiver:post active format=json
```

Use `social-archiver:share path="Notes/My Thoughts.md" format=json` if the user wants a web share URL in addition to the local timeline post.

### 7. Generate and inspect an AI comment

```bash
# Optional readiness check for local AI CLIs.
obsidian vault="Research" social-archiver:ai-providers format=json

# Schedule comment generation. type=custom requires prompt=<text>.
obsidian vault="Research" social-archiver:ai-comment \
  path="Social Archives/X/2026/05/post.md" \
  type=summary provider=claude outputLanguage=ko format=json

# Poll lightly until the new comment appears; typical completion is 15-60s.
obsidian vault="Research" social-archiver:ai-comments \
  path="Social Archives/X/2026/05/post.md" format=json
```

For custom comments, pass `type=custom prompt="<specific request>"`. For translation use `type=translation language=<target-language>`.

## Error handling

The response envelope is `{ ok: true, ... }` or `{ ok: false, error: { code, message, retryable, details? } }`. Retryable codes are safe to retry with backoff. Non-retryable codes mean the agent should stop and report to the user.

Reserved error codes and whether they are retryable (full table in `references/output-schema.md`):

| Code | Retryable |
| --- | --- |
| `CLI_UNAVAILABLE` | no |
| `AUTH_REQUIRED` | no |
| `INVALID_ARGUMENT` | no |
| `UNSUPPORTED_PLATFORM` | no |
| `SERVICE_NOT_READY` | yes |
| `PAYWALL_REQUIRED` | no |
| `INSUFFICIENT_CREDITS` | no |
| `RATE_LIMITED` | yes |
| `JOB_NOT_FOUND` | no |
| `NETWORK_ERROR` | yes |
| `TIMEOUT_ERROR` | yes |
| `CIRCUIT_OPEN` | yes |
| `DOC_ID_STALE` | yes |
| `OPERATION_FAILED` | varies (read `retryable`) |

Always trust the `retryable` field in the response over the table; the server may override based on context.

## Pointers

- Full command catalog with flags and examples: `references/commands.md`
- Standard envelope, error code semantics, terminal statuses, redaction rules, billing fallback policy: `references/output-schema.md`
- Direct vault Markdown contract for timeline posts, personal notes, AI comments, platform comments, path lookup, and YAML fields: `references/vault-markdown.md`
- TweetClaw/X source-pack intake for selected public X/Twitter posts and threads: `references/tweetclaw-x-source-pack.md`
- Optional Node wrapper that hardcodes `format=json` and implements bounded polling: `scripts/social-archiver-cli.mjs`
