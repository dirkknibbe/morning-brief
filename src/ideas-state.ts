/**
 * ideas-state.ts — MongoDB CRUD for the ideas collection + CLI.
 *
 * Pure dedupe-decision logic lives in dedupe-ideas.ts; this file is the
 * I/O layer.
 *
 * CLI modes:
 *   list [status]               — print top-50 ideas (optionally filtered)
 *   show <slug>                 — print one idea as JSON
 *   set-status <slug> <status> [reason]
 *
 * Library exports for extract-ideas.ts:
 *   findIdeaByHash(db, hash) → ExistingIdea | null
 *   applyUpsertOp(db, op)
 *   listIdeas(db, { status?, limit? })
 *   getIdea(db, slug)
 *   setStatus(db, slug, status, reason?)
 */

import { MongoClient, type Db } from "mongodb";
import type { ExistingIdea, UpsertOp } from "./dedupe-ideas";
import { type Status, isValidStatus, assertValidTransition } from "./status";

export async function findIdeaByHash(db: Db, hash: string): Promise<ExistingIdea | null> {
  const doc = await db.collection("ideas").findOne({ content_hash: hash });
  if (!doc) return null;
  return {
    slug: doc.slug,
    content_hash: doc.content_hash,
    signal_strength: doc.signal_strength,
    sources: doc.sources ?? [],
  };
}

export async function applyUpsertOp(db: Db, op: UpsertOp): Promise<void> {
  if (op.kind === "skip") return;
  if (op.kind === "insert") {
    try {
      await db.collection("ideas").insertOne(op.doc as any);
    } catch (e: any) {
      // Duplicate key (race against a concurrent insert) — fall through.
      if (e.code !== 11000) throw e;
    }
    return;
  }
  // reinforce
  await db.collection("ideas").updateOne(
    { slug: op.slug },
    {
      $inc: { signal_strength: 1 },
      $addToSet: { sources: op.new_source as any },
      $set: { updated_at: new Date() },
    },
  );
}

export async function listIdeas(
  db: Db,
  filter: { status?: string; limit?: number } = {},
): Promise<any[]> {
  const q: any = {};
  if (filter.status) q.status = filter.status;
  return db
    .collection("ideas")
    .find(q)
    .sort({ signal_strength: -1, created_at: -1 })
    .limit(filter.limit ?? 50)
    .toArray();
}

export async function getIdea(db: Db, slug: string): Promise<any | null> {
  return db.collection("ideas").findOne({ slug });
}

export async function setStatus(
  db: Db,
  slug: string,
  newStatus: string,
  reason?: string,
): Promise<void> {
  if (!isValidStatus(newStatus)) {
    throw new Error(`invalid status: ${newStatus}`);
  }
  const existing = await db
    .collection("ideas")
    .findOne({ slug }, { projection: { status: 1 } });
  if (!existing) {
    throw new Error(`no idea: ${slug}`);
  }
  if (!isValidStatus(existing.status)) {
    throw new Error(`existing status corrupt for ${slug}: ${existing.status}`);
  }
  assertValidTransition(existing.status, newStatus);

  const set: Record<string, unknown> = { status: newStatus, updated_at: new Date() };
  if (reason) set.rejection_reason = reason;
  await db.collection("ideas").updateOne({ slug }, { $set: set });
}

// CLI
if (import.meta.main) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ideas-state: MONGODB_URI is not set");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB ?? "morning-brief";
  const mode = process.argv[2];
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);

    if (mode === "list") {
      const status = process.argv[3];
      const docs = await listIdeas(db, { status, limit: 50 });
      console.log(JSON.stringify(docs, null, 2));
    } else if (mode === "show") {
      const slug = process.argv[3];
      if (!slug) { console.error("usage: ideas-state show <slug>"); process.exit(1); }
      const doc = await getIdea(db, slug);
      if (!doc) { console.error(`no idea: ${slug}`); process.exit(1); }
      console.log(JSON.stringify(doc, null, 2));
    } else if (mode === "set-status") {
      const slug = process.argv[3];
      const status = process.argv[4];
      const reason = process.argv[5];
      if (!slug || !status) {
        console.error("usage: ideas-state set-status <slug> <status> [reason]");
        process.exit(1);
      }
      await setStatus(db, slug, status, reason);
      console.log(`✓ ${slug} → ${status}${reason ? ` (${reason})` : ""}`);
    } else {
      console.error("usage: ideas-state <list|show|set-status> [args]");
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}
