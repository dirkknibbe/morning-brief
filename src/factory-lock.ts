/**
 * factory-lock.ts — single-document mutex for the factory.
 *
 * One build at a time. The lock document lives in `factory_lock` keyed by
 * `_id: "singleton"`. Stale locks (older than `ttl_ms`) are takeable —
 * passive expiry, no separate watchdog process needed.
 *
 * Acquire is two-phase atomic (standard Mongo lock pattern):
 *   1. Try insert. If E11000, a doc exists.
 *   2. Try CAS update with filter on `started_at < cutoff` to steal a stale lock.
 *
 * If both phases fail to acquire, the lock is held by a fresh owner.
 */
import type { Db } from "mongodb";

const SINGLETON_ID = "singleton";

export interface LockState {
  idea_slug: string;
  started_at: Date;
  pid: number;
}

export interface LockResult {
  acquired: boolean;
  prior_owner: LockState | null;
  takeover: boolean;
}

export async function acquireLock(
  db: Db,
  ideaSlug: string,
  ttlMs: number,
  pid: number = process.pid,
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
    });
    return { acquired: true, prior_owner: null, takeover: false };
  } catch (e: any) {
    if (e.code !== 11000) throw e;
    // Doc exists — fall through to phase 2.
  }

  // Phase 2: read existing, then try CAS takeover if stale.
  const existing = await db.collection("factory_lock").findOne({ _id: SINGLETON_ID as any });
  if (!existing) {
    // Vanished between phase 1's E11000 and this read — retry once via phase 1.
    // Caller can simply re-call acquireLock; we report blocked to be safe.
    return { acquired: false, prior_owner: null, takeover: false };
  }

  const prior: LockState = {
    idea_slug: existing.idea_slug,
    started_at: existing.started_at,
    pid: existing.pid,
  };

  const cutoff = new Date(now.getTime() - (existing.ttl_ms ?? ttlMs));
  const takeoverResult = await db.collection("factory_lock").findOneAndUpdate(
    {
      _id: SINGLETON_ID as any,
      started_at: { $lt: cutoff },
    },
    {
      $set: {
        idea_slug: ideaSlug,
        started_at: now,
        ttl_ms: ttlMs,
        pid,
      },
    },
    { returnDocument: "before" },
  );

  if (takeoverResult) {
    // Update succeeded; the prior owner we returned is from the CAS read.
    return { acquired: true, prior_owner: prior, takeover: true };
  }

  // Lock is fresh — blocked.
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

export async function checkLock(db: Db): Promise<LockState | null> {
  const doc = await db.collection("factory_lock").findOne({ _id: SINGLETON_ID as any });
  if (!doc) return null;
  return {
    idea_slug: doc.idea_slug,
    started_at: doc.started_at,
    pid: doc.pid,
  };
}
