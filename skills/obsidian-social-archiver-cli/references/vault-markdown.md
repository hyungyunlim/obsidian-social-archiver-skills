# Direct Vault Markdown Contract

Use this when a task can be completed by creating or editing Social Archiver Markdown files directly, without invoking the Obsidian CLI. Direct edits are appropriate for timeline posts, personal notes, archive tags, and manually supplied AI/comment content. Use the CLI for network fetches, media download, share URLs, sync, jobs, imports, auth, billing, or settings mutations.

## Resolve settings and paths

Vault paths are relative to the Obsidian vault root. If the user gives an absolute path, use it directly; otherwise join the vault root and the vault path. Do not treat vault paths as URLs.

Read `.obsidian/plugins/social-archiver/data.json` if it exists. Relevant keys:

- `archivePath`, default `Social Archives`
- `mediaPath`, default `attachments/social-archives`
- `archiveOrganization`, default `platform-year-month`
- `fileNameFormat`, default `{published_date} - {author} - {title} ({short_id})`
- `username` and `userAvatar`, used for `platform: post`

If settings are unavailable, use the defaults above.

## Find an existing archive

Prefer exact vault paths. If the user gives `Social Archives/.../post.md`, resolve that file first.

If the user gives a server/archive id, search Markdown frontmatter under `archivePath` for exact `sourceArchiveId`. This is the stable lookup key used by sync and annotations.

If the user gives a source URL, search frontmatter `originalUrl` first, then the body footer line `**Original URL:** <url>`. If multiple files match, do not guess; report the candidates.

If the user gives a title or partial text, search under `archivePath` and select only when one result is clearly the intended note.

## YAML editing rules

Use a YAML parser whenever available. Preserve unknown frontmatter fields exactly as much as possible, especially `share`, `shareUrl`, `shareMode`, `sharePassword`, `sourceArchiveId`, `mediaSourceUrls`, `downloadedUrls`, `processedUrls`, `transcribedUrls`, `archiveTags`, and `aiComments`.

Core fields commonly expected on archive notes:

```yaml
share: false
platform: x
author: Display Name
authorUrl: https://x.com/example
published: 2026-05-19 09:30
archived: 2026-05-19 09:35
lastModified: 2026-05-19 09:35
archive: false
tags: []
originalUrl: https://x.com/example/status/123
sourceArchiveId: archive_abc123
```

For user-created timeline posts, `platform: post` files must have at least `author` and either `published` or `archived`. Recommended frontmatter:

```yaml
share: false
platform: post
author: You
authorUrl: Social Archives/Post/2026/05/2026-05-19-093000.md
published: 2026-05-19 09:30
archived: 2026-05-19 09:30
lastModified: 2026-05-19 09:30
archive: false
tags: []
originalUrl: Social Archives/Post/2026/05/2026-05-19-093000.md
postOrigin: composer
clientPostId: post_550e8400-e29b-41d4-a716-446655440000
syncState: pending
```

`postOrigin`, `clientPostId`, and `syncState` are only needed when the new composed post should participate in composed-post sync. For a purely local timeline item, they may be omitted.

## Create a timeline post

For a new composed timeline post, use:

```text
{archivePath}/Post/{YYYY}/{MM}/{YYYY-MM-DD-HHmmss}.md
```

Example:

```text
Social Archives/Post/2026/05/2026-05-19-093000.md
```

For "post this existing note to the timeline", mimic the plugin's note-post flow:

1. Search `{archivePath}/Post` for `originalPath: <source vault path>`.
2. If found, update that existing timeline copy instead of creating a duplicate.
3. If not found, create `{archivePath}/Post/{YYYY}/{MM}/{source filename}.md`.
4. Copy the source body without its original frontmatter.
5. Set `platform: post`, `postedAt: YYYY-MM-DD HH:mm`, `originalPath: <source vault path>`, `author`, `archived`, `lastModified`, and `tags: []`.

The body can be ordinary Markdown. A leading `# Heading` becomes the card title for user-created posts. The renderer expects a footer like this but can still parse a minimal post without it:

```markdown
---

**Author:** You | **Published:** 2026-05-19 09:30
```

If copying attachments, place them under `{mediaPath}/post/{postId-or-dateSegment}/filename`, update embeds to the new vault paths, and avoid overwriting existing files. If media resolution is uncertain, leave the original references unchanged and mention that media was not copied.

## Add or update a personal note

Personal notes are stored in frontmatter as `comment`. This is the "My Note" / saved-header note shown on archive cards.

```yaml
comment: |-
  Why I saved this:
  This is useful for the timeline post.
lastModified: 2026-05-19 09:35
```

Do not append a personal note to the body as if it were an AI comment. To remove a personal note, delete `comment` or set it to an empty string and update `lastModified`.

## Append an AI-style comment manually

AI comments live in the Markdown body under `## AI Comments`. Each comment must have a parseable heading, a hidden id, optional hidden metadata, and content. Also update frontmatter `aiComments` to include the id as a string.

Supported CLI ids and display labels:

- `claude` -> `🤖 Claude`
- `gemini` -> `✨ Gemini`
- `codex` -> `💡 Codex`

Supported types and display labels:

- `summary` -> `Summary`
- `factcheck` -> `Fact Check`
- `critique` -> `Critical Analysis`
- `keypoints` -> `Key Points`
- `sentiment` -> `Sentiment Analysis`
- `connections` -> `Note Connections`
- `translation` -> `Translation`
- `translate-transcript` -> `Translate Transcript`
- `glossary` -> `Glossary`
- `reformat` -> `Reformat`
- `custom` -> `Custom Prompt`

ID format:

```text
{cli}-{type}-{YYYYMMDDTHHmmssZ}
```

Example:

```yaml
aiComments:
  - codex-custom-20260519T003000Z
```

```markdown
## AI Comments

### 💡 Codex · Custom Prompt · May 19, 2026
<!-- id: codex-custom-20260519T003000Z -->
<!-- ai-comment-meta: %7B%22customPrompt%22%3A%22Relate%20this%20to%20my%20project%22%7D -->

This post is relevant because ...
```

The `ai-comment-meta` value is `encodeURIComponent(JSON.stringify(metadata))`. Metadata is optional; useful keys are `model`, `processingTime`, `contentHash`, `customPrompt`, `sourceLanguage`, and `targetLanguage`.

If `## AI Comments` already exists, append the new comment at the end of that section. Comments are separated by:

```markdown

---

```

If the file contains `<!-- social-archiver:annotations:start -->` after the AI comment section, insert the new AI comment before that marker so the parser sees it.

## Preserve platform comments

`## 💬 Comments` is for comments imported from the original platform, not for the user's personal note. Use it only when representing source-platform comments.

Format top-level comments as:

```markdown
## 💬 Comments

**[@handle](https://example.com/handle)** · 2026-05-19 09:30 · 3 likes
Comment body.

  ↳ **@reply_handle** · 2026-05-19 09:32
  Reply body.

---

**Another Author**
Another top-level comment.
```

Keep this section before the metadata footer (`---` followed by `**Platform:** ...`) when present. Update frontmatter `comments` or `commentCount` only if the count is known.

## Tags and archive state

`tags` is normal Obsidian/frontmatter tagging. `archiveTags` is the Social Archiver tag list synced with the server. Preserve both unless the user explicitly asks to change them.

To mark a post archived/hidden from timeline, set:

```yaml
archive: true
lastModified: 2026-05-19 09:35
```

To keep it visible:

```yaml
archive: false
```

