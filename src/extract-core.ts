/**
 * extract-core.ts — pure, side-effect-free core of the extract pipeline.
 *
 * Split out of extract-ideas.ts so the per-candidate loop is testable
 * (no top-level Mongo connection / process.exit) and so one malformed
 * candidate can never abort the whole run. I/O is injected via ExtractDeps.
 */

import { contentHash } from "./content-hash";
import { decideUpsertOp, type ExistingIdea, type UpsertOp } from "./dedupe-ideas";
import type { IdeaCandidate } from "./parse-ideas";

export interface ExtractDeps {
  findByHash: (hash: string) => Promise<ExistingIdea | null>;
  apply: (op: UpsertOp) => Promise<void>;
}

export interface ExtractSummary {
  candidates: number;
  inserted: number;
  reinforced: number;
  skipped: number;
  failed: number;
}

/**
 * Process every candidate, isolating failures. A candidate that throws
 * (e.g. a document the $jsonSchema validator rejects) is logged and counted
 * in `failed`; the run continues with the next candidate. Op-kind counters
 * are incremented only after a successful apply.
 */
export async function runExtraction(
  candidates: IdeaCandidate[],
  deps: ExtractDeps,
): Promise<ExtractSummary> {
  const summary: ExtractSummary = {
    candidates: candidates.length,
    inserted: 0,
    reinforced: 0,
    skipped: 0,
    failed: 0,
  };

  for (const c of candidates) {
    try {
      const hash = contentHash(c.title, c.raw_text);
      const existing = await deps.findByHash(hash);
      const op = decideUpsertOp(c, hash, existing);
      await deps.apply(op);
      if (op.kind === "insert") summary.inserted++;
      else if (op.kind === "reinforce") summary.reinforced++;
      else summary.skipped++;
    } catch (e: any) {
      summary.failed++;
      console.error(
        `extract: candidate failed (${c.source_file} / ${c.source_section}): ${e?.message ?? e}`,
      );
    }
  }

  return summary;
}
