/**
 * ideas-state.ts — MongoDB CRUD for the ideas collection + CLI.
 *
 * Pure dedupe-decision logic lives in dedupe-ideas.ts; this file is the
 * I/O layer.
 *
 * CLI modes:
 *   list [status]               — print top-50 ideas (optionally filtered)
 *   show <slug>                 — print one idea as JSON
 *   set-status <slug> <status> [reason]   (actor recorded as "user-cli")
 *
 * Library exports for extract-ideas.ts:
 *   findIdeaByHash(db, hash) → ExistingIdea | null
 *   applyUpsertOp(db, op, actor)
 *   listIdeas(db, { status?, limit? })
 *   getIdea(db, slug)
 *   setStatus(db, slug, newStatus, actor, reason?)
 *
 * Status transitions are enforced via status.ts ALLOWED_TRANSITIONS.
 * Every transition (insert and update) writes a best-effort audit_log row
 * via audit.ts — failures are logged but do not propagate.
 */

import { MongoClient, type Db } from "mongodb";
import type { ExistingIdea, UpsertOp } from "./dedupe-ideas";
import type { Status } from "./status";
import { isValidStatus, assertValidTransition } from "./status";
import { recordTransition } from "./audit";
import { embed } from "./embeddings";
import { findMidBandClusters, type ClusterItem } from "./cluster-ideas";
import { slugify } from "./dedupe-ideas";
import { createHash } from "node:crypto";

export function isSynthesisEligible(idea: {
  signal_strength: number;
  synthesis_depth: number;
  status: Status;
}): boolean {
  const ELIGIBLE_STATUSES: ReadonlySet<Status> = new Set([
    "extracted",
    "queued",
    "parked",
  ]);
  return (
    ELIGIBLE_STATUSES.has(idea.status) &&
    idea.signal_strength >= 1 &&
    idea.synthesis_depth <= 1
  );
}

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

export async function applyUpsertOp(db: Db, op: UpsertOp, actor: string): Promise<void> {
  if (op.kind === "skip") return;
  if (op.kind === "insert") {
    let inserted = false;
    try {
      await db.collection("ideas").insertOne(op.doc as any);
      inserted = true;
    } catch (e: any) {
      // Duplicate key (race against a concurrent insert) — fall through.
      if (e.code !== 11000) throw e;
    }
    if (inserted) {
      // Audit is best-effort observability; a failed insertOne to audit_log
      // must NOT propagate as a caller-visible error after the idea insert
      // already committed, and must NOT block retry (a re-run on the same
      // input would hit code-11000 in the idea insert and skip — which would
      // also skip the audit row if it were tied to the idea-insert try).
      try {
        await recordTransition(db, op.doc.slug, null, "extracted", actor);
      } catch (e) {
        console.error(`audit: recordTransition failed for ${op.doc.slug}:`, (e as Error).message);
      }
    }
    return;
  }
  // reinforce — no audit row (idempotent re-observation, not a transition)
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
  actor: string,
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

  // Audit is best-effort; the status change already committed above. A failed
  // audit insertOne must not propagate as a caller-visible error.
  try {
    await recordTransition(db, slug, existing.status, newStatus, actor, reason);
  } catch (e) {
    console.error(`audit: recordTransition failed for ${slug}:`, (e as Error).message);
  }
}

/**
 * Returns up to 10 clusters of 2-4 idea slugs each, plus the full idea
 * records hydrated for the synthesize trigger to read. Pure-logic
 * inputs/outputs — Mongo I/O is in the calling CLI subcommand.
 */
export async function buildSynthesisCandidates(
  ideas: ReadonlyArray<{
    slug: string;
    title: string;
    raw_text: string;
    signal_strength: number;
    synthesis_depth: number;
    status: Status;
    theme_hints: string[];
  }>,
): Promise<
  Array<{
    cluster_slugs: string[];
    ideas: Array<{
      slug: string;
      title: string;
      raw_text: string;
      theme_hints: string[];
    }>;
  }>
> {
  const eligible = ideas.filter(isSynthesisEligible);
  if (eligible.length < 2) return [];

  const embedded: ClusterItem[] = [];
  for (const idea of eligible) {
    const text = `${idea.title}\n${idea.raw_text.split("\n")[0] ?? ""}`;
    const e = await embed(text);
    embedded.push({ id: idea.slug, embedding: e });
  }

  const clusters = findMidBandClusters(embedded);
  const bySlug = new Map(eligible.map((i) => [i.slug, i]));
  return clusters.map((slugs) => ({
    cluster_slugs: slugs,
    ideas: slugs.map((s) => {
      const i = bySlug.get(s)!;
      return {
        slug: i.slug,
        title: i.title,
        raw_text: i.raw_text,
        theme_hints: i.theme_hints,
      };
    }),
  }));
}

export interface SynthesisParent {
  slug: string;
  signal_strength: number;
  synthesis_depth: 0 | 1 | 2;
  theme_hints: string[];
  status: Status;
}

export function buildSynthesisDoc(args: {
  title: string;
  thesis: string;
  parents: SynthesisParent[];
  now: Date;
  rawText: string;
}) {
  const { title, thesis, parents, now, rawText } = args;
  if (parents.length < 2) {
    throw new Error("buildSynthesisDoc: at least 2 parents required");
  }
  if (parents.some((p) => p.status === "rejected")) {
    throw new Error(
      "buildSynthesisDoc: cannot synthesize when any parent is rejected",
    );
  }
  const maxDepth = Math.max(...parents.map((p) => p.synthesis_depth));
  const newDepth = maxDepth + 1;
  if (newDepth > 2) {
    throw new Error(
      `buildSynthesisDoc: synthesis_depth would be ${newDepth} (max is 2)`,
    );
  }
  const maxSig = Math.max(...parents.map((p) => p.signal_strength));
  const themeUnion = Array.from(
    new Set(parents.flatMap((p) => p.theme_hints)),
  );
  return {
    slug: slugify(title),
    content_hash: createHash("sha256")
      .update(`synthesis:${parents.map((p) => p.slug).sort().join("|")}:${title}`)
      .digest("hex"),
    title,
    raw_text: rawText,
    sources: parents.map((p) => ({ brief: `parent:${p.slug}`, section: "synthesis" })),
    signal_strength: maxSig + 1,
    theme_hints: themeUnion,
    status: "extracted" as const,
    kind: "synthesis" as const,
    parents: parents.map((p) => p.slug),
    synthesis_thesis: thesis,
    synthesis_depth: newDepth as 1 | 2,
    prior_art: null,
    scores: null,
    success_criteria: null,
    rejection_reason: null,
    learnings: [] as string[],
    attempts: 0,
    created_at: now,
    updated_at: now,
  };
}

function parseFlagArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        out[key] = val;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
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
      await setStatus(db, slug, status, "user-cli", reason);
      console.log(`✓ ${slug} → ${status}${reason ? ` (${reason})` : ""}`);
    } else if (mode === "cluster-candidates") {
      const ideas = await db.collection("ideas").find({}, {
        projection: {
          slug: 1, title: 1, raw_text: 1,
          signal_strength: 1, synthesis_depth: 1, status: 1, theme_hints: 1,
        },
      }).toArray();
      const candidates = await buildSynthesisCandidates(ideas as any);
      console.log(JSON.stringify(candidates, null, 2));
    } else if (mode === "insert-synthesis") {
      const args = parseFlagArgs(process.argv.slice(3));
      const parentSlugs = (args.parents ?? "").split(",").filter(Boolean);
      if (parentSlugs.length < 2) {
        console.error("insert-synthesis: --parents needs >=2 slugs (comma-separated)");
        process.exit(1);
      }
      const title = args.title;
      const thesis = args.thesis;
      const rawText = args["raw-text"] ?? thesis;
      if (!title || !thesis) {
        console.error("insert-synthesis: --title and --thesis are required");
        process.exit(1);
      }
      const parents = await db
        .collection("ideas")
        .find({ slug: { $in: parentSlugs } })
        .toArray();
      if (parents.length !== parentSlugs.length) {
        const found = new Set(parents.map((p: any) => p.slug));
        const missing = parentSlugs.filter((s) => !found.has(s));
        console.error("insert-synthesis: parent(s) not found:", missing.join(", "));
        process.exit(1);
      }
      const doc = buildSynthesisDoc({
        title,
        thesis,
        parents: parents as any,
        now: new Date(),
        rawText,
      });
      await db.collection("ideas").insertOne(doc);
      try {
        await recordTransition(db, doc.slug, null, "extracted", "user-cli", `parents=${doc.parents.join(",")}`);
      } catch (e) {
        console.error(`audit: recordTransition failed for ${doc.slug}:`, (e as Error).message);
      }
      console.log(`✓ inserted synthesis ${doc.slug} (parents: ${doc.parents.join(", ")})`);
    } else {
      console.error("usage: ideas-state <list|show|set-status|cluster-candidates|insert-synthesis> [args]");
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}
