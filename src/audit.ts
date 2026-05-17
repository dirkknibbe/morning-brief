/**
 * audit.ts — append-only audit log for status transitions.
 *
 * Mongo I/O. Imported by ideas-state.ts (writes after every status change
 * and after every successful insert).
 */
import type { Db } from "mongodb";
import type { Status } from "./status";

export async function recordTransition(
  db: Db,
  slug: string,
  from: Status | null,
  to: Status,
  actor: string,
  reason?: string,
): Promise<void> {
  await db.collection("audit_log").insertOne({
    slug,
    from,
    to,
    actor,
    reason: reason ?? null,
    ts: new Date(),
  });
}
