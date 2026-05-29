import { test, expect } from "bun:test";
import { runExtraction, type ExtractDeps } from "../extract-core";
import type { IdeaCandidate } from "../parse-ideas";

function cand(title: string): IdeaCandidate {
  return {
    title,
    raw_text: `${title} body text`,
    source_file: "briefs/x.md",
    source_section: "Opportunity Sparks",
    theme_hints: [],
    extracted_at: new Date(),
  };
}

test("runExtraction continues past a failing candidate and counts it", async () => {
  const candidates = [cand("one"), cand("two"), cand("three")];
  let applyCalls = 0;
  const deps: ExtractDeps = {
    findByHash: async () => null, // every candidate is a fresh insert
    apply: async () => {
      applyCalls++;
      if (applyCalls === 2) throw new Error("Document failed validation");
    },
  };

  const summary = await runExtraction(candidates, deps);

  // One bad candidate must NOT abort the run — all three are attempted.
  expect(applyCalls).toBe(3);
  expect(summary.failed).toBe(1);
  expect(summary.inserted).toBe(2); // 1st and 3rd succeeded
  expect(summary.candidates).toBe(3);
});

test("runExtraction tallies insert / reinforce / skip by op kind", async () => {
  const candidates = [cand("alpha"), cand("beta")];
  const deps: ExtractDeps = {
    // alpha is new (insert); beta already exists with the same source (skip)
    findByHash: async (_hash: string) => null,
    apply: async () => {},
  };
  const summary = await runExtraction(candidates, deps);
  expect(summary.inserted).toBe(2);
  expect(summary.failed).toBe(0);
});
