/**
 * extract-ideas.ts — scan briefs/ and actions/, extract candidate ideas,
 * upsert to MongoDB `ideas` collection.
 *
 * Idempotent: re-running on the same files produces zero writes once
 * every (brief, section) pair has been recorded.
 *
 * Usage:
 *   bun run extract-ideas
 *   bun run extract-ideas --dry-run   (parse + summary, no Mongo writes)
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { parseIdeasFromBrief, parseIdeasFromAction, type IdeaCandidate } from "./parse-ideas";
import { findIdeaByHash, applyUpsertOp } from "./ideas-state";
import { isFrozen, isEnabled } from "./system-state";
import { runExtraction } from "./extract-core";

function readDirMarkdown(dir: string): { path: string; body: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((n) => ({ path: join(dir, n), body: readFileSync(join(dir, n), "utf8") }));
}

const dryRun = process.argv.includes("--dry-run");
const uri = process.env.MONGODB_URI;
if (!uri && !dryRun) {
  console.error("extract-ideas: MONGODB_URI is not set (use --dry-run for parse-only)");
  process.exit(1);
}

const briefs = readDirMarkdown("briefs");
const actions = readDirMarkdown("actions");

const candidates: IdeaCandidate[] = [
  ...briefs.flatMap((f) => parseIdeasFromBrief(f.body, f.path)),
  ...actions.flatMap((f) => parseIdeasFromAction(f.body, f.path)),
];

const scanned = {
  briefs_scanned: briefs.length,
  actions_scanned: actions.length,
};

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        ...scanned,
        candidates: candidates.length,
        sample: candidates.slice(0, 5).map((c) => ({ title: c.title, source: c.source_file, section: c.source_section })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const dbName = process.env.MONGODB_DB ?? "morning-brief";
const client = new MongoClient(uri!);
try {
  await client.connect();
  const db = client.db(dbName);

  if (await isFrozen(db)) {
    console.log("extract-ideas: skipping (system frozen)");
    await client.close();
    process.exit(0);
  }
  if (!(await isEnabled(db, "extract"))) {
    console.log("extract-ideas: skipping (extract disabled)");
    await client.close();
    process.exit(0);
  }

  const result = await runExtraction(candidates, {
    findByHash: (hash) => findIdeaByHash(db, hash),
    apply: (op) => applyUpsertOp(db, op, "extract-ideas"),
  });
  console.log(JSON.stringify({ ...scanned, ...result }, null, 2));
} finally {
  await client.close();
}
