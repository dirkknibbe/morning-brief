import { test, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Behavioral tests for run-trigger.sh failure handling, run against a sandbox
// copy of the script. run-trigger.sh prepends $HOME/.bun/bin to PATH ahead of
// everything else (the real claude lives in ~/.local/bin), so pointing HOME at
// a fake home whose .bun/bin/claude is a shim deterministically intercepts the
// claude call — no real API traffic.

const SCRIPT = new URL("../run-trigger.sh", import.meta.url).pathname;

let sandbox: string;
let repo: string;
let fakeHome: string;
let shimArgsFile: string;
const stems: string[] = [];

// The script hardcodes /tmp (not $TMPDIR) for the dedupe marker.
const markerPath = (stem: string) => `/tmp/morning-brief-${stem}-last-run`;

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "run-trigger-test-"));
  repo = join(sandbox, "repo");
  fakeHome = join(sandbox, "home");
  shimArgsFile = join(sandbox, "shim-args");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(join(repo, "triggers"), { recursive: true });
  mkdirSync(join(fakeHome, ".bun", "bin"), { recursive: true });
  copyFileSync(SCRIPT, join(repo, "scripts", "run-trigger.sh"));
  chmodSync(join(repo, "scripts", "run-trigger.sh"), 0o755);
});

afterAll(() => {
  for (const stem of stems) rmSync(markerPath(stem), { force: true });
  rmSync(sandbox, { recursive: true, force: true });
});

function writeShim(body: string): void {
  const shim = join(fakeHome, ".bun", "bin", "claude");
  writeFileSync(shim, `#!/bin/bash\necho "$*" > "${shimArgsFile}"\n${body}\n`);
  chmodSync(shim, 0o755);
}

function newStem(name: string): string {
  const stem = `rt-test-${process.pid}-${name}`;
  stems.push(stem);
  rmSync(markerPath(stem), { force: true });
  writeFileSync(
    join(repo, "triggers", `${stem}.md`),
    "Test trigger. If a real model ever reads this, reply with the single word: ok\n",
  );
  return stem;
}

function runTrigger(stem: string, extraEnv: Record<string, string> = {}) {
  rmSync(shimArgsFile, { force: true });
  return spawnSync(
    "bash",
    [join(repo, "scripts", "run-trigger.sh"), `triggers/${stem}.md`],
    {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, HOME: fakeHome, ...extraEnv },
    },
  );
}

function readLog(stem: string): string {
  const logsDir = join(repo, "logs");
  const file = readdirSync(logsDir).find((f) => f.startsWith(`${stem}-`));
  if (!file) throw new Error(`no log file for ${stem}`);
  return readFileSync(join(logsDir, file), "utf8");
}

const count = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

test("API error with claude exit 0 exits non-zero and clears the dedupe marker", () => {
  const stem = newStem("apifail");
  writeShim('echo "API Error: Unable to connect to API (ConnectionRefused)"\nexit 0');

  const res = runTrigger(stem);

  expect(existsSync(shimArgsFile)).toBe(true); // shim ran, not the real claude
  expect(res.status).toBe(1);
  expect(existsSync(markerPath(stem))).toBe(false);
  const log = readLog(stem);
  expect(log).toContain("API Error: Unable to connect to API (ConnectionRefused)");
  expect(log).toContain(`finished ${stem} (exit 1)`);
});

test("claude non-zero exit propagates and clears the dedupe marker", () => {
  const stem = newStem("exit3");
  writeShim('echo "boom" >&2\nexit 3');

  const res = runTrigger(stem);

  expect(res.status).toBe(3);
  expect(existsSync(markerPath(stem))).toBe(false);
  expect(readLog(stem)).toContain(`finished ${stem} (exit 3)`);
});

test("success keeps exit 0, unchanged log format, marker set, dedupe blocks re-run", () => {
  const stem = newStem("ok");
  writeShim('echo "brief sent"\nexit 0');

  const res = runTrigger(stem, { MAX_BUDGET_USD: "7" });

  expect(res.status).toBe(0);
  expect(readFileSync(shimArgsFile, "utf8")).toContain("--max-budget-usd 7");
  expect(existsSync(markerPath(stem))).toBe(true);
  const log = readLog(stem);
  expect(log).toContain("brief sent");
  expect(log).toContain(`finished ${stem} (exit 0)`);
  expect(log).not.toContain("clearing dedupe marker");

  const rerun = runTrigger(stem);
  expect(rerun.status).toBe(0);
  expect(rerun.stderr).toContain("(< 21h), skipping");
  expect(count(readLog(stem), `starting ${stem}`)).toBe(1);
});

test("failed run does not block a same-day retry", () => {
  const stem = newStem("retry");
  writeShim('echo "API Error: The socket connection was closed unexpectedly"\nexit 0');
  expect(runTrigger(stem).status).toBe(1);

  writeShim('echo "brief sent"\nexit 0');
  const retry = runTrigger(stem);

  expect(retry.status).toBe(0);
  expect(count(readLog(stem), `starting ${stem}`)).toBe(2);
  expect(existsSync(markerPath(stem))).toBe(true);
});

test("SKIP_DEDUPE=1 still bypasses the guard after a successful run", () => {
  const stem = newStem("skipdedupe");
  writeShim('echo "brief sent"\nexit 0');
  expect(runTrigger(stem).status).toBe(0); // marker is now fresh

  const res = runTrigger(stem, { SKIP_DEDUPE: "1" });

  expect(res.status).toBe(0);
  expect(count(readLog(stem), `starting ${stem}`)).toBe(2);
});
