# Social Archiver Skills

Agent skills for [Social Archiver](https://github.com/hyungyunlim/obsidian-social-archiver). Lets Claude Code, Codex CLI, and any other [Agent Skills](https://www.anthropic.com/news/agent-skills)–compatible agent archive social-media posts, post vault notes to the timeline, add comments to archived posts, poll jobs, manage tags, run subscriptions sync, and import Instagram Saved exports — by driving either the **Obsidian plugin** (through the `obsidian` CLI or direct vault Markdown) or the **desktop app** (through its standalone `sa` / `social-archiver` CLI) — without opening modals or relying on UI state.

Each skill targets a different Social Archiver surface — see the table below for which app it needs:

- **`obsidian-social-archiver-cli`** — the [Obsidian Social Archiver plugin](https://github.com/hyungyunlim/obsidian-social-archiver) (v3.6.2+) installed and enabled in a vault, with Obsidian 1.12.2+ and the CLI enabled (Settings → General → Command line interface).
- **`social-archiver-desktop-cli`** — the Social Archiver **desktop app** (which bundles the `sa` CLI — install it onto PATH from Settings → Command line → Install ‘sa’ command), or the desktop-app source in dev (`npm run cli`). No Obsidian required.

> ⚠️ Both skills archive **only public content you have permission to save**, are subject to per-tier **credit** and **rate limits**, and never print or transmit your tokens/keys. The desktop skill spells these out in its [Scope, limits & disclaimer](./skills/social-archiver-desktop-cli/SKILL.md#scope-limits--disclaimer) section.

## Install

### Claude Code marketplace

```
/plugin marketplace add hyungyunlim/obsidian-social-archiver-skills
/plugin install social-archiver@obsidian-social-archiver-skills
```

### npx skills

```
npx skills add https://github.com/hyungyunlim/obsidian-social-archiver-skills
```

### Manual install

**Claude Code** — copy the repo contents into the `.claude` folder at your Obsidian vault root (or a project root) per the [Claude Skills docs](https://docs.anthropic.com/claude-code/skills):

```bash
git clone https://github.com/hyungyunlim/obsidian-social-archiver-skills
cp -r obsidian-social-archiver-skills/skills /path/to/vault/.claude/
```

**Codex CLI** — copy the `skills/` directory to your Codex skills path (typically `~/.codex/skills`):

```bash
git clone https://github.com/hyungyunlim/obsidian-social-archiver-skills
cp -r obsidian-social-archiver-skills/skills/* ~/.codex/skills/
```

**OpenCode** — clone the full repo to `~/.opencode/skills/obsidian-social-archiver-skills/` preserving the structure. Skills auto-discover after restart.

## Available skills

| Skill | Function |
|---|---|
| [`obsidian-social-archiver-cli`](./skills/obsidian-social-archiver-cli/SKILL.md) | Operate the Obsidian Social Archiver plugin through `obsidian` CLI or direct vault Markdown — archive URLs, post vault notes to the timeline, generate/list AI comments, edit personal notes, poll jobs, list/apply tags, run subscriptions sync, import Instagram exports. |
| [`social-archiver-desktop-cli`](./skills/social-archiver-desktop-cli/SKILL.md) | Drive the Social Archiver **desktop** app headlessly through its standalone `sa` CLI (no GUI, no Obsidian) — archive a URL and poll job status, read account/capability status, export archives to local Markdown for off-server find/analyze, push frontmatter edits (tags/liked/bookmarked) back, classify/comment by file, and run the headless AI-comment executor (`executor --watch`). |

## Known platform limitation (`obsidian-social-archiver-cli` only)

Obsidian 1.12.7 CLI loses handler output when a `registerCliHandler` Promise yields to the macrotask queue (real network I/O, file writes). Commands that touch the network (`jobs:check`, `sync`, `profile-crawl`, `subscribe`, `import-*`, `share`, `post`, `media`) follow a fire-and-forget pattern — they schedule the work and return a `{ scheduled: true, … }` envelope immediately. Agents should observe outcomes by polling local state with read-only commands (`job source=local`, `jobs`, `tags`, etc.). See the [tracking thread](https://forum.obsidian.md/t/codex-cannot-get-results-from-delayed-handlers-registerd-with-registerclihandler/113184).

## License

[MIT](./LICENSE)
