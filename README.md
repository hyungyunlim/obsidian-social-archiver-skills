# Social Archiver Skills

Agent skills for the [Obsidian Social Archiver](https://github.com/hyungyunlim/obsidian-social-archiver) plugin. Lets Claude Code, Codex CLI, and any other [Agent Skills](https://www.anthropic.com/news/agent-skills)–compatible agent drive the Obsidian CLI to archive social-media posts, poll jobs, manage tags, run subscriptions sync, and import Instagram Saved exports — without opening modals or relying on UI state.

Requires the [Obsidian Social Archiver plugin](https://github.com/hyungyunlim/obsidian-social-archiver) (v3.6.2+) installed and enabled in an Obsidian vault, and Obsidian 1.12.2+ with CLI enabled (Settings → General → Command line interface).

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
| [`obsidian-social-archiver-cli`](./skills/obsidian-social-archiver-cli/SKILL.md) | Operate the Obsidian Social Archiver plugin through `obsidian` CLI — archive URLs, poll jobs, list/apply tags, run subscriptions sync, import Instagram exports. |

## Known platform limitation

Obsidian 1.12.7 CLI loses handler output when a `registerCliHandler` Promise yields to the macrotask queue (real network I/O, file writes). Commands that touch the network (`jobs:check`, `sync`, `profile-crawl`, `subscribe`, `import-*`, `share`, `post`, `media`) follow a fire-and-forget pattern — they schedule the work and return a `{ scheduled: true, … }` envelope immediately. Agents should observe outcomes by polling local state with read-only commands (`job source=local`, `jobs`, `tags`, etc.). See the [tracking thread](https://forum.obsidian.md/t/codex-cannot-get-results-from-delayed-handlers-registerd-with-registerclihandler/113184).

## License

[MIT](./LICENSE)
