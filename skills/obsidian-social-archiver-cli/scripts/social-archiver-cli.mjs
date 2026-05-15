#!/usr/bin/env node
/**
 * social-archiver-cli.mjs
 *
 * Thin Node wrapper around the Obsidian CLI for Social Archiver commands.
 *
 * Hardcodes format=json so output is always machine-parseable, and exposes a
 * bounded polling helper (awaitJob) for long-running archive/import jobs.
 *
 * No external dependencies; uses only node:child_process and node:process.
 *
 * Usage as a module:
 *   import { runCli, awaitJob } from "./social-archiver-cli.mjs";
 *
 *   const status = await runCli("social-archiver");
 *   const queued = await runCli("social-archiver:archive", { url: "..." });
 *   const final  = await awaitJob(queued.data.jobId);
 *
 * Usage as a script:
 *   ./social-archiver-cli.mjs --vault="Research" social-archiver
 *   ./social-archiver-cli.mjs --vault="Research" social-archiver:archive url="https://..."
 *   ./social-archiver-cli.mjs --vault="Research" await-job id="job-..." [interval=5] [max=60]
 *
 * Vault resolution order:
 *   1. --vault=<name> arg
 *   2. OBSIDIAN_VAULT env var
 *
 * Exit codes:
 *   0 on success
 *   1 on { ok: false } CLI response
 *   2 on spawn / parse error
 */

import { spawn } from "node:child_process";
import process from "node:process";

const OBSIDIAN_BIN = process.env.OBSIDIAN_BIN || "obsidian";

/** Quote a single key=value pair safely for the Obsidian CLI argv. */
function formatFlag(key, value) {
  if (value === true) return key; // bare boolean flag
  if (value === false || value === undefined || value === null) return null;
  return `${key}=${value}`;
}

function resolveVault(explicit) {
  if (explicit) return explicit;
  if (process.env.OBSIDIAN_VAULT) return process.env.OBSIDIAN_VAULT;
  throw new Error(
    "Vault not specified. Pass vault= via runCli({ vault }) or set OBSIDIAN_VAULT.",
  );
}

/**
 * Run a single Social Archiver CLI command and return the parsed JSON
 * response envelope.
 *
 * @param {string} command - e.g. "social-archiver:archive"
 * @param {Record<string, unknown>} [flags={}] - key=value flags (boolean true = bare flag)
 * @param {{ vault?: string, timeoutMs?: number }} [opts={}]
 * @returns {Promise<object>} Parsed CLI response (already JSON).
 */
export function runCli(command, flags = {}, opts = {}) {
  const vault = resolveVault(opts.vault);
  const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 60_000;

  // Always force format=json. Caller cannot override.
  const argv = [
    `vault=${vault}`,
    command,
    ...Object.entries(flags)
      .filter(([k]) => k !== "format")
      .map(([k, v]) => formatFlag(k, v))
      .filter((s) => s !== null),
    "format=json",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(OBSIDIAN_BIN, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const killer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Obsidian CLI timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(killer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(killer);
      if (code !== 0 && stdout.trim() === "") {
        const err = new Error(
          `Obsidian CLI exited with code ${code} (no stdout). stderr: ${stderr.trim()}`,
        );
        err.code = code;
        err.stderr = stderr;
        return reject(err);
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (parseErr) {
        const err = new Error(
          `Failed to parse Obsidian CLI JSON output for ${command}: ${parseErr.message}\nstdout: ${stdout.slice(0, 500)}`,
        );
        err.cause = parseErr;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

/**
 * Poll an archive job to terminal status using bounded retries with exponential backoff.
 *
 * The plugin's PendingJobOrchestrator processes the queue automatically — there
 * is no need to call `jobs:check` between iterations. We optionally fire it
 * ONCE at the start as a nudge (in case the orchestrator was idle).
 *
 * Defaults (token-efficient for AI agents):
 *   - 8 attempts max
 *   - Exponential backoff: 3s, 6s, 12s, 24s, 30s, 30s, 30s, 30s (~165s cap)
 *   - Caller can override via { backoffMs: [...] } or { intervalMs, maxAttempts } for linear timing.
 *
 * Platform timing reference:
 *   - Bluesky / Mastodon / Threads (direct):  2-5s   → terminal by attempt 1-2
 *   - Reddit / Pinterest / YouTube:           5-10s  → terminal by attempt 2
 *   - Instagram / X / Facebook / TikTok:      15-60s → terminal by attempt 3-5
 *   - Naver Blog / Cafe / Brunch (local):     10-30s → terminal by attempt 2-3
 *
 * Terminal statuses: completed, failed, cancelled.
 *
 * @param {string} jobId
 * @param {{
 *   vault?: string,
 *   maxAttempts?: number,
 *   intervalMs?: number,
 *   backoffMs?: number[],
 *   driveQueueOnce?: boolean,
 *   syncServer?: boolean,
 *   onTick?: (status: object) => void
 * }} [opts={}]
 * @returns {Promise<object>} The final social-archiver:job response.
 */
export async function awaitJob(jobId, opts = {}) {
  const defaultBackoff = [3_000, 6_000, 12_000, 24_000, 30_000, 30_000, 30_000, 30_000];
  const backoff = opts.backoffMs ?? defaultBackoff;
  const maxAttempts = opts.maxAttempts ?? backoff.length;
  const linearInterval = opts.intervalMs;
  const driveQueueOnce = opts.driveQueueOnce ?? true;
  const syncServer = opts.syncServer ?? false;
  const TERMINAL = new Set(["completed", "failed", "cancelled"]);

  // Optional one-shot nudge to the queue. Non-fatal on error.
  if (driveQueueOnce) {
    try {
      await runCli(
        "social-archiver:jobs:check",
        syncServer ? { syncServer: true } : {},
        opts,
      );
    } catch {
      /* swallow — orchestrator auto-runs */
    }
  }

  let lastResponse = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const jobResp = await runCli("social-archiver:job", { id: jobId }, opts);
    lastResponse = jobResp;

    if (typeof opts.onTick === "function") {
      try {
        opts.onTick(jobResp);
      } catch {
        // Ignore consumer errors.
      }
    }

    if (jobResp.ok === false) {
      const code = jobResp.error?.code;
      if (code === "JOB_NOT_FOUND" || jobResp.error?.retryable === false) {
        return jobResp;
      }
    } else if (jobResp.ok === true) {
      const status = jobResp.data?.status;
      if (status && TERMINAL.has(status)) {
        return jobResp;
      }
    }

    if (attempt < maxAttempts - 1) {
      const wait = linearInterval ?? backoff[Math.min(attempt, backoff.length - 1)];
      await sleep(wait);
    }
  }

  return lastResponse;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lightweight argv parser for CLI usage of this script.
 * Recognizes --vault=<name> and a sequence of key=value pairs / bare flags.
 */
function parseArgv(argv) {
  let vault;
  let command;
  const flags = {};

  for (const tok of argv) {
    if (tok.startsWith("--vault=")) {
      vault = tok.slice("--vault=".length);
      continue;
    }
    if (!command) {
      command = tok;
      continue;
    }
    const eq = tok.indexOf("=");
    if (eq === -1) {
      flags[tok] = true;
    } else {
      flags[tok.slice(0, eq)] = tok.slice(eq + 1);
    }
  }

  return { vault, command, flags };
}

async function main() {
  const { vault, command, flags } = parseArgv(process.argv.slice(2));

  if (!command) {
    process.stderr.write(
      "Usage: social-archiver-cli.mjs [--vault=<name>] <command> [key=value ...]\n" +
        "       social-archiver-cli.mjs [--vault=<name>] await-job id=<jobId> [interval=<sec>] [max=<attempts>]\n",
    );
    process.exit(2);
  }

  try {
    if (command === "await-job") {
      const jobId = flags.id;
      if (!jobId) {
        process.stderr.write("await-job requires id=<jobId>\n");
        process.exit(2);
      }
      const intervalSec = flags.interval ? Number(flags.interval) : 5;
      const max = flags.max ? Number(flags.max) : 60;
      const resp = await awaitJob(jobId, {
        vault,
        intervalMs: intervalSec * 1000,
        maxAttempts: max,
        syncServer: flags.syncServer === "true" || flags.syncServer === true,
      });
      process.stdout.write(JSON.stringify(resp, null, 2) + "\n");
      process.exit(resp?.ok === false ? 1 : 0);
    }

    const resp = await runCli(command, flags, { vault });
    process.stdout.write(JSON.stringify(resp, null, 2) + "\n");
    process.exit(resp?.ok === false ? 1 : 0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(2);
  }
}

// Run main only when executed directly (not when imported).
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("social-archiver-cli.mjs");

if (invokedDirectly) {
  main();
}
