/**
 * dedupe-ideas.ts — pure dedupe-decision logic for the ideas pipeline.
 *
 * Mongo I/O lives in ideas-state.ts; this module only decides what op
 * (insert / reinforce / skip) should be applied given a candidate and
 * the matching existing record (if any).
 */
import type { IdeaCandidate } from "./parse-ideas";

export interface IdeaSource {
  brief: string;
  section: string;
}

export interface ExistingIdea {
  slug: string;
  content_hash: string;
  signal_strength: number;
  sources: IdeaSource[];
}

export interface NewIdeaDoc {
  slug: string;
  content_hash: string;
  title: string;
  raw_text: string;
  sources: IdeaSource[];
  signal_strength: number;
  theme_hints: string[];
  status: "extracted";
  kind: "simple";
  parents: null;
  synthesis_thesis: null;
  synthesis_depth: 0;
  prior_art: null;
  scores: null;
  success_criteria: null;
  rejection_reason: null;
  learnings: string[];
  attempts: number;
  created_at: Date;
  updated_at: Date;
}

export type UpsertOp =
  | { kind: "insert"; doc: NewIdeaDoc }
  | { kind: "reinforce"; slug: string; new_source: IdeaSource }
  | { kind: "skip" };

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join("-")
    .slice(0, 60);
}

export function decideUpsertOp(
  candidate: IdeaCandidate,
  candidateHash: string,
  existing: ExistingIdea | null,
): UpsertOp {
  const newSource: IdeaSource = {
    brief: candidate.source_file,
    section: candidate.source_section,
  };

  if (!existing) {
    return {
      kind: "insert",
      doc: {
        slug: slugify(candidate.title),
        content_hash: candidateHash,
        title: candidate.title,
        raw_text: candidate.raw_text,
        sources: [newSource],
        signal_strength: 1,
        theme_hints: candidate.theme_hints,
        status: "extracted",
        kind: "simple",
        parents: null,
        synthesis_thesis: null,
        synthesis_depth: 0,
        prior_art: null,
        scores: null,
        success_criteria: null,
        rejection_reason: null,
        learnings: [],
        attempts: 0,
        created_at: candidate.extracted_at,
        updated_at: candidate.extracted_at,
      },
    };
  }

  const alreadyRecorded = existing.sources.some(
    (s) => s.brief === newSource.brief && s.section === newSource.section,
  );
  if (alreadyRecorded) return { kind: "skip" };

  return { kind: "reinforce", slug: existing.slug, new_source: newSource };
}
