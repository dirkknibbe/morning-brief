/**
 * factory-runs.ts — the factory_runs collection: one document per build.
 * Pure builders (buildRunDoc, buildRoundEntry) + thin Mongo wrappers.
 */
import { ObjectId, type Db } from "mongodb";
import type { Classification } from "./criteria-classify";

export type Terminator = "done" | "stuck" | "scope-break" | "capped" | "aborted";

export interface RoundEntry {
  n: number;
  failing_test_count: number;
  hypothesis: string;
  test_output_excerpt: string;
}

export interface RunDoc {
  idea_slug: string;
  started_at: Date;
  ended_at: Date | null;
  terminator: Terminator | null;
  rounds: number;
  branch: string;
  repo_url: string | null;
  build_dir: string;
  criteria_classification: Classification[];
  human_handoff: string[];
  rounds_log: RoundEntry[];
  cost_usd: number | null;
  tokens: number | null;
  duration_s: number | null;
}

export interface BuildRunArgs {
  idea_slug: string;
  build_dir: string;
  branch: string;
  criteria_classification: Classification[];
}

const EXCERPT_MAX = 2000;

export function buildRunDoc(args: BuildRunArgs, now: Date = new Date()): RunDoc {
  return {
    idea_slug: args.idea_slug,
    started_at: now,
    ended_at: null,
    terminator: null,
    rounds: 0,
    branch: args.branch,
    repo_url: null,
    build_dir: args.build_dir,
    criteria_classification: args.criteria_classification,
    human_handoff: args.criteria_classification
      .filter((c) => c.kind === "human_or_external")
      .map((c) => c.text),
    rounds_log: [],
    cost_usd: null,
    tokens: null,
    duration_s: null,
  };
}

export function buildRoundEntry(
  n: number,
  failing_test_count: number,
  hypothesis: string,
  test_output_excerpt: string,
): RoundEntry {
  return {
    n,
    failing_test_count,
    hypothesis,
    test_output_excerpt: test_output_excerpt.slice(0, EXCERPT_MAX),
  };
}

export interface FinalizeFields {
  terminator: Terminator;
  ended_at: Date;
  branch?: string;
  repo_url?: string | null;
  cost_usd?: number | null;
  tokens?: number | null;
  duration_s?: number | null;
}

export async function createRun(db: Db, doc: RunDoc): Promise<string> {
  const r = await db.collection("factory_runs").insertOne(doc as any);
  return r.insertedId.toString();
}

export async function appendRound(db: Db, runId: string, entry: RoundEntry): Promise<void> {
  await db.collection("factory_runs").updateOne(
    { _id: new ObjectId(runId) },
    { $push: { rounds_log: entry as any }, $set: { rounds: entry.n } },
  );
}

export async function finalizeRun(db: Db, runId: string, fields: FinalizeFields): Promise<void> {
  await db.collection("factory_runs").updateOne(
    { _id: new ObjectId(runId) },
    { $set: fields as any },
  );
}
