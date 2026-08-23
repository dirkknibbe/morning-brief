/**
 * factory-lock.ts — single-document mutex for the factory.
 *
 * One build at a time. The lock document lives in `factory_lock` keyed by
 * `_id: "singleton"`. A lock is REAPABLE when its owning process group is dead
 * (liveness) OR it is older than `ttl_ms` (passive expiry) — a reapable lock is
 * takeable by a new build and reported as "no build" by checkLock. No separate
 * watchdog process is needed for lock hygiene.
 *
 * Acquire is two-phase atomic (standard Mongo lock pattern):
 *   1. Try insert. If E11000, a doc exists.
 *   2. If the existing doc is reapable, CAS-steal it (match the exact prior
 *      owner so the steal is atomic against a concurrent acquirer).
 *
 * If both phases fail to acquire, the lock is held by a live, fresh owner.
 */
import type { Db } from "mongodb";

const SINGLETON_ID = "singleton";

export interface LockState {
  idea_slug: string;
  started_at: Date;
  pid: number;
  pgid: number;
}

export interface LockResult {
  acquired: boolean;
  prior_owner: LockState | null;
  takeover: boolean;
}

/** Injectable liveness check (so reap logic is testable without real processes). */
export type IsAlive = (pgid: number) => boolean;

/**
 * Is the factory process group alive? A build holds the lock while its group
 * lives; once the group is gone (finished, crashed, or watchdog-killed) the lock
 * is orphaned and reapable. An unknown/unsafe pgid (≤1) is treated as ALIVE so a
 * malformed lock is never wrongly reaped — it falls back to TTL expiry instead.
 */
export function pgidAlive(pgid: number): boolean {
  if (!Number.isInteger(pgid) || pgid <= 1) return true;
  try {
    process.kill(-pgid, 0); // signal 0 = existence probe on the whole group
    return true;
  } catch (e) {
    // ESRCH → group gone (dead); EPERM → exists but not ours (alive).
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Pure reap decision (no DB, no processes) — a lock is reapable when its owning
 * group is dead OR it has outlived its TTL. Kept pure so it unit-tests without
 * a live Mongo or real process groups.
 */
export function isLockReapable(
  lock: { started_at: Date; ttl_ms?: number; pgid?: number },
  nowMs: number,
  isAlive: IsAlive,
  fallbackTtlMs: number,
): boolean {
  if (lock.pgid != null && !isAlive(lock.pgid)) return true;
  const ttl = lock.ttl_ms ?? fallbackTtlMs;
  return nowMs - lock.started_at.getTime() >= ttl;
}

export async function acquireLock(
  db: Db,
  ideaSlug: string,
  ttlMs: number,
  pid: number = process.pid,
  pgid: number = pid,
  isAlive: IsAlive = pgidAlive,
): Promise<LockResult> {
  const now = new Date();

  // Phase 1: try insert.
  try {
    await db.collection("factory_lock").insertOne({
      _id: SINGLETON_ID as any,
      idea_slug: ideaSlug,
      started_at: now,
      ttl_ms: ttlMs,
      pid,
      pgid,
    });
    return { acquired: true, prior_owner: null, takeover: false };
  } catch (e: any) {
    if (e.code !== 11000) throw e;
    // Doc exists — fall through to phase 2.
  }

  // Phase 2: read existing, then CAS-steal if it's reapable.
  const existing = await db.collection("factory_lock").findOne({ _id: SINGLETON_ID as any });
  if (!existing) {
    // Vanished between phase 1's E11000 and this read — report blocked; the
    // caller can simply re-call acquireLock to retry phase 1.
    return { acquired: false, prior_owner: null, takeover: false };
  }

  const prior: LockState = {
    idea_slug: existing.idea_slug,
    started_at: existing.started_at,
    pid: existing.pid,
    pgid: existing.pgid,
  };

  if (!isLockReapable(existing as any, now.getTime(), isAlive, ttlMs)) {
    // Lock is held by a live, fresh owner — blocked.
    return { acquired: false, prior_owner: prior, takeover: false };
  }

  // Reapable: CAS-steal by matching the EXACT prior owner, so a concurrent
  // acquirer can't have us both succeed.
  const takeoverResult = await db.collection("factory_lock").findOneAndUpdate(
    { _id: SINGLETON_ID as any, started_at: existing.started_at, pid: existing.pid },
    { $set: { idea_slug: ideaSlug, started_at: now, ttl_ms: ttlMs, pid, pgid } },
    { returnDocument: "before" },
  );

  if (takeoverResult) return { acquired: true, prior_owner: prior, takeover: true };

  // Lost the race to another acquirer — blocked.
  return { acquired: false, prior_owner: prior, takeover: false };
}

export async function releaseLock(db: Db, ideaSlug: string): Promise<void> {
  // Defensive: only delete if we still own the lock. Prevents a takeover
  // race from one factory accidentally releasing another's lock.
  await db.collection("factory_lock").deleteOne({
    _id: SINGLETON_ID as any,
    idea_slug: ideaSlug,
  });
}

/**
 * Current live build, or null. A reapable lock (dead group or TTL-expired) is
 * reported as null — so /factory-status and start-factory.sh's pre-flight agree
 * with acquireLock that an orphaned/stale lock means "no build running".
 */
export async function checkLock(
  db: Db,
  isAlive: IsAlive = pgidAlive,
  fallbackTtlMs: number = 3_600_000,
): Promise<LockState | null> {
  const doc = await db.collection("factory_lock").findOne({ _id: SINGLETON_ID as any });
  if (!doc) return null;
  if (isLockReapable(doc as any, Date.now(), isAlive, fallbackTtlMs)) return null;
  return {
    idea_slug: doc.idea_slug,
    started_at: doc.started_at,
    pid: doc.pid,
    pgid: doc.pgid,
  };
}
