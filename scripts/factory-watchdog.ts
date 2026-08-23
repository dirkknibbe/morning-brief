#!/usr/bin/env bun
/**
 * factory-watchdog.ts <pgid> [buildDir] — idle-based watchdog for a factory build.
 *
 * A factory run has no internal timeout on a stalled MCP/API/tool call (one run
 * sat idle ~33h holding the lock). But a legitimately-large build can also run a
 * long time — so we must NOT kill on wall-clock alone. Instead we kill on lack of
 * PROGRESS: every check we sample the build group's cumulative CPU-time and the
 * build repo's HEAD. Either advancing = progress (reset the idle timer). No
 * progress for the idle limit = hung → kill the group. An absolute ceiling is the
 * final backstop. The killed group's Mongo lock then reaps by liveness
 * (src/factory-lock.ts), so the factory isn't wedged.
 *
 * Launched detached by start-factory.sh; runs OUTSIDE the factory's process group
 * so killing the group doesn't kill the watchdog. Logs to the factory log.
 *
 * Env overrides (seconds): FACTORY_WATCHDOG_CHECK_S (300), _IDLE_S (1200=20m),
 * _CEILING_S (21600=6h), _CPU_THRESH_S (5). FACTORY_WATCHDOG=0 disables (handled
 * in start-factory.sh — this script always runs when invoked).
 */

/** Parse a `ps -o time=` value → seconds. Handles "SS.ss", "MM:SS.ss",
 *  "HH:MM:SS", and "D-HH:MM:SS". */
export function parsePsTime(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  let days = 0;
  let rest = s;
  const dash = s.indexOf("-");
  if (dash !== -1) {
    days = Number(s.slice(0, dash)) || 0;
    rest = s.slice(dash + 1);
  }
  const parts = rest.split(":").map(Number);
  let secs = 0;
  if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
  else secs = parts[0] || 0;
  return days * 86400 + secs;
}

export interface Progress {
  cpuSeconds: number;
  head: string;
}

/** Progress = the group burned meaningful CPU since last check OR the build repo
 *  advanced (a new commit / the repo appearing). Either means "still building". */
export function progressed(prev: Progress, cur: Progress, cpuThresholdSeconds: number): boolean {
  return cur.cpuSeconds - prev.cpuSeconds > cpuThresholdSeconds || cur.head !== prev.head;
}

// ── runtime (only when invoked directly) ──────────────────────────────

async function run(argv: readonly string[]): Promise<string> {
  const proc = Bun.spawn([...argv], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

async function groupPids(pgid: number): Promise<number[]> {
  const out = await run(["pgrep", "-g", String(pgid)]);
  return out.trim().split("\n").filter(Boolean).map(Number).filter(Number.isInteger);
}

async function groupCpuSeconds(pids: number[]): Promise<number> {
  if (pids.length === 0) return 0;
  const args = ["-o", "time="];
  for (const pid of pids) args.push("-p", String(pid));
  const out = await run(["ps", ...args]);
  return out.trim().split("\n").filter(Boolean).reduce((sum, line) => sum + parsePsTime(line), 0);
}

async function buildHead(buildDir: string): Promise<string> {
  if (!buildDir) return "";
  const out = await run(["git", "-C", buildDir, "rev-parse", "HEAD"]);
  return out.trim(); // "" when the repo doesn't exist yet or command failed
}

function log(msg: string): void {
  console.log(`${new Date().toISOString()} factory-watchdog: ${msg}`);
}

async function killGroup(pgid: number): Promise<void> {
  try {
    process.kill(-pgid, "SIGTERM");
  } catch {
    /* already gone */
  }
  await Bun.sleep(15_000);
  try {
    process.kill(-pgid, "SIGKILL");
  } catch {
    /* gone */
  }
}

const envSec = (name: string, def: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

async function main(): Promise<void> {
  const pgid = Number(process.argv[2]);
  const buildDir = process.argv[3] ?? "";
  if (!Number.isInteger(pgid) || pgid <= 1) {
    console.error("usage: factory-watchdog.ts <pgid> [buildDir]");
    process.exit(2);
  }
  const checkMs = envSec("FACTORY_WATCHDOG_CHECK_S", 300) * 1000;
  const idleMs = envSec("FACTORY_WATCHDOG_IDLE_S", 1200) * 1000;
  const ceilingMs = envSec("FACTORY_WATCHDOG_CEILING_S", 21_600) * 1000;
  const cpuThresh = envSec("FACTORY_WATCHDOG_CPU_THRESH_S", 5);

  const startMs = Date.now();
  let prev: Progress = { cpuSeconds: await groupCpuSeconds(await groupPids(pgid)), head: await buildHead(buildDir) };
  let idleStartMs = Date.now();
  log(`watching group ${pgid} (idle-limit ${idleMs / 1000}s, ceiling ${ceilingMs / 1000}s)`);

  for (;;) {
    await Bun.sleep(checkMs);
    const pids = await groupPids(pgid);
    if (pids.length === 0) {
      log(`group ${pgid} gone — build ended on its own; exiting`);
      process.exit(0);
    }
    const cur: Progress = { cpuSeconds: await groupCpuSeconds(pids), head: await buildHead(buildDir) };
    const now = Date.now();
    if (progressed(prev, cur, cpuThresh)) {
      idleStartMs = now;
      prev = cur;
    } else if (now - idleStartMs >= idleMs) {
      log(`no progress for ${Math.round((now - idleStartMs) / 1000)}s (cpuΔ<${cpuThresh}s, HEAD unchanged) — killing hung group ${pgid}`);
      await killGroup(pgid);
      process.exit(0);
    }
    if (now - startMs >= ceilingMs) {
      log(`absolute ceiling ${ceilingMs / 1000}s reached — killing group ${pgid}`);
      await killGroup(pgid);
      process.exit(0);
    }
  }
}

if (import.meta.main) {
  await main();
}
