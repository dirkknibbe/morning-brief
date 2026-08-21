/**
 * format.ts — small display helpers for listener replies.
 */

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/**
 * First diagnostic line of shell-out output. `bun run` echoes a `$ bun run …`
 * banner as stderr line 1 (even when piped), so a naive first-line grab logs
 * the banner and discards the actual error; skip banner lines. The argvs also
 * pass `--silent`, but this keeps logs useful if that flag ever regresses.
 */
export function firstLine(text: string): string {
  for (const line of text.trim().split("\n")) {
    if (!line.startsWith("$ ")) return line;
  }
  return "";
}

/** "42s" | "2m 14s" | "1h 5m" — for /factory-status elapsed time. */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / MS_PER_SECOND));
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  if (hours > 0) return `${hours}h ${totalMinutes % MINUTES_PER_HOUR}m`;
  if (totalMinutes > 0) return `${totalMinutes}m ${totalSeconds % SECONDS_PER_MINUTE}s`;
  return `${totalSeconds}s`;
}

/** Minimal shape /factory-status needs from the factory lock. */
export interface FactoryLockView {
  readonly idea_slug: string;
  readonly started_at: string;
}

/**
 * /factory-status reply. `startupAlive` is true when `/build` has launched a
 * factory whose process group is still alive but which hasn't acquired the
 * Mongo lock yet — the ~45s claude-boot window. Without that branch the status
 * lies "no build running" for the first ~45s after `/build`, which reads as a
 * broken build.
 */
export function factoryStatusReply(
  lock: FactoryLockView | null,
  startupAlive: boolean,
  now: number,
): string {
  if (lock) {
    const elapsed = formatElapsed(now - new Date(lock.started_at).getTime());
    return `🏭 ${lock.idea_slug} running for ~${elapsed}\n\nPer-round heartbeats land in the build thread in the factory channel.`;
  }
  if (startupAlive) {
    return "🏭 a build is starting up (acquiring the lock) — check again in a few seconds";
  }
  return "no build running";
}
