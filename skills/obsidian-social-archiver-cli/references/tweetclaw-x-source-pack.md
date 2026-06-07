# TweetClaw/X Source-Pack Intake

Use this reference when a user provides TweetClaw results, TweetClaw exports,
or a manually prepared X/Twitter source pack that should become Social Archiver
vault notes.

TweetClaw is only an upstream source-selection tool in this workflow. The
Obsidian Social Archiver plugin remains responsible for archiving URLs,
downloading media according to user settings, adding personal notes, creating
AI comments, managing tags, and writing vault Markdown.

## Accepted Inputs

A source pack may include:

- `source_urls`: canonical `https://x.com/<handle>/status/<id>` URLs.
- `tweet_ids`: tweet IDs that need canonical URL reconstruction.
- `handles`: author handles used to build or verify canonical URLs.
- `reply_threads`: ordered URLs or IDs for reply-chain context.
- `public_metrics`: likes, replies, reposts, views, or capture-time counts.
- `media_urls`: public media URLs or notes about expected attachments.
- `capture_time`: ISO timestamp for when the source pack was captured.
- `source_notes`: user notes about why the item matters.

Do not require every field. A clean canonical URL is enough to start an archive
job.

## Intake Rules

1. Normalize URLs to `https://x.com/<handle>/status/<id>` when the handle and ID
   are known.
2. Archive only user-selected URLs. Do not expand the pack into unrelated
   searches or account crawls unless the user asks.
3. Add compact tags such as `tweetclaw`, `x-research`, project names, or topic
   names with `tags=<csv>`.
4. Preserve non-live source metadata in `comment=<text>`, especially
   `capture_time`, source-pack order, and user notes.
5. Treat `public_metrics` as capture-time context. Do not describe it as live
   engagement data unless the user explicitly refreshed the source pack.
6. Use Social Archiver polling rules from `SKILL.md` after submitting archive
   jobs.
7. Add summaries, fact checks, or project-specific commentary with
   `social-archiver:ai-comment` after the archive note exists.

Do not call TweetClaw from this skill. Do not scrape, post, reply, send DMs,
schedule posts, operate accounts, run browser automation, or call X/Twitter
platform APIs from this skill. Ask the user to provide the source pack or URLs.

## Archive Examples

Archive one selected TweetClaw result:

```bash
obsidian vault="Research" social-archiver:archive \
  url="https://x.com/example/status/1234567890" \
  tags="tweetclaw,x-research,launch-feedback" \
  comment="TweetClaw source pack captured 2026-06-07T21:28:49Z; thread item 1/5; metrics captured separately." \
  mode=queue format=json
```

Archive a reply-thread item while preserving order:

```bash
obsidian vault="Research" social-archiver:archive \
  url="https://x.com/example/status/1234567891" \
  tags="tweetclaw,x-thread,customer-research" \
  comment="TweetClaw source pack captured 2026-06-07T21:28:49Z; reply thread item 2/5; parent tweet: 1234567890." \
  mode=queue format=json
```

After each command, poll the returned job ID with:

```bash
obsidian vault="Research" social-archiver:job \
  id="<jobId>" format=json
```

## Direct Markdown Notes

Use direct vault Markdown only when a Social Archiver note already exists or
the task is file-local. If adding TweetClaw metadata to an existing archive
note, preserve unknown frontmatter and update only target fields:

```yaml
tags:
  - tweetclaw
  - x-research
comment: |-
  TweetClaw source pack captured 2026-06-07T21:28:49Z.
  Selected for launch-feedback research.
lastModified: 2026-06-07 21:28
```

Do not overwrite `originalUrl`, `sourceArchiveId`, `downloadedUrls`,
`processedUrls`, `mediaSourceUrls`, `aiComments`, `archiveTags`, or `share`
fields while adding source-pack context.
