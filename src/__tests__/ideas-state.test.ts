import { test, expect } from "bun:test";
import { isSynthesisEligible, buildSynthesisDoc } from "../ideas-state";

test("isSynthesisEligible accepts extracted/queued/parked with signal_strength >= 1 and synthesis_depth <= 1", () => {
  const base = { signal_strength: 1, synthesis_depth: 0, status: "extracted" as const };
  expect(isSynthesisEligible({ ...base })).toBe(true);
  expect(isSynthesisEligible({ ...base, status: "queued" })).toBe(true);
  expect(isSynthesisEligible({ ...base, status: "parked" })).toBe(true);
});

test("isSynthesisEligible rejects rejected/needs_human/building/built", () => {
  const base = { signal_strength: 5, synthesis_depth: 0, status: "rejected" as const };
  expect(isSynthesisEligible(base)).toBe(false);
  expect(isSynthesisEligible({ ...base, status: "needs_human" })).toBe(false);
  expect(isSynthesisEligible({ ...base, status: "building" })).toBe(false);
  expect(isSynthesisEligible({ ...base, status: "built" })).toBe(false);
});

test("isSynthesisEligible rejects signal_strength < 1", () => {
  expect(
    isSynthesisEligible({ signal_strength: 0, synthesis_depth: 0, status: "extracted" }),
  ).toBe(false);
});

test("isSynthesisEligible rejects synthesis_depth > 1 (depth-2 leaves cannot be parents)", () => {
  expect(
    isSynthesisEligible({ signal_strength: 5, synthesis_depth: 2, status: "extracted" }),
  ).toBe(false);
});

// buildSynthesisDoc tests

const baseParent = {
  slug: "p1",
  signal_strength: 2,
  synthesis_depth: 0 as const,
  theme_hints: ["alpha"],
  status: "extracted" as const,
};

test("buildSynthesisDoc computes signal_strength = max(parents) + 1", () => {
  const doc = buildSynthesisDoc({
    title: "combo",
    thesis: "thesis text",
    parents: [
      { ...baseParent, signal_strength: 3 },
      { ...baseParent, slug: "p2", signal_strength: 5, theme_hints: ["beta"] },
    ],
    now: new Date("2026-05-14T07:00:00Z"),
    rawText: "combo raw",
  });
  expect(doc.signal_strength).toBe(6);
});

test("buildSynthesisDoc computes synthesis_depth = 1 + max(parents.synthesis_depth)", () => {
  const doc = buildSynthesisDoc({
    title: "combo",
    thesis: "thesis text",
    parents: [
      { ...baseParent, synthesis_depth: 0 },
      { ...baseParent, slug: "p2", synthesis_depth: 1 },
    ],
    now: new Date(),
    rawText: "rt",
  });
  expect(doc.synthesis_depth).toBe(2);
});

test("buildSynthesisDoc unions theme_hints from parents", () => {
  const doc = buildSynthesisDoc({
    title: "t",
    thesis: "h",
    parents: [
      { ...baseParent, theme_hints: ["a", "b"] },
      { ...baseParent, slug: "p2", theme_hints: ["b", "c"] },
    ],
    now: new Date(),
    rawText: "rt",
  });
  expect(doc.theme_hints.sort()).toEqual(["a", "b", "c"]);
});

test("buildSynthesisDoc sets kind/parents/synthesis_thesis correctly", () => {
  const doc = buildSynthesisDoc({
    title: "t",
    thesis: "the thesis",
    parents: [baseParent, { ...baseParent, slug: "p2" }],
    now: new Date(),
    rawText: "rt",
  });
  expect(doc.kind).toBe("synthesis");
  expect(doc.parents).toEqual(["p1", "p2"]);
  expect(doc.synthesis_thesis).toBe("the thesis");
  expect(doc.status).toBe("extracted");
});

test("buildSynthesisDoc throws if any parent is rejected", () => {
  expect(() =>
    buildSynthesisDoc({
      title: "t",
      thesis: "h",
      parents: [baseParent, { ...baseParent, slug: "p2", status: "rejected" }],
      now: new Date(),
      rawText: "rt",
    }),
  ).toThrow(/rejected/);
});

test("buildSynthesisDoc throws if fewer than 2 parents", () => {
  expect(() =>
    buildSynthesisDoc({
      title: "t",
      thesis: "h",
      parents: [baseParent],
      now: new Date(),
      rawText: "rt",
    }),
  ).toThrow(/at least 2 parents/);
});

test("buildSynthesisDoc throws if synthesis_depth would exceed 2", () => {
  expect(() =>
    buildSynthesisDoc({
      title: "t",
      thesis: "h",
      parents: [
        { ...baseParent, synthesis_depth: 2 },
        { ...baseParent, slug: "p2" },
      ],
      now: new Date(),
      rawText: "rt",
    }),
  ).toThrow(/depth/);
});

// validateTriagePayload tests

import { validateTriagePayload } from "../ideas-state";

test("validateTriagePayload accepts all four score keys in 1-5", () => {
  expect(() =>
    validateTriagePayload({
      scores: { novelty: 5, fit: 3, buildable: 2, scope: 4 },
      success_criteria: ["criterion one"],
      prior_art: { twist: "a twist", sources: [{ url: "https://x", takeaway: "t" }] },
    }),
  ).not.toThrow();
});

test("validateTriagePayload rejects scores outside 1-5", () => {
  expect(() =>
    validateTriagePayload({
      scores: { novelty: 6, fit: 3, buildable: 2, scope: 4 },
      success_criteria: ["x"],
      prior_art: { twist: "t", sources: [] },
    }),
  ).toThrow(/novelty/);
});

test("validateTriagePayload rejects empty success_criteria (build loop needs targets)", () => {
  expect(() =>
    validateTriagePayload({
      scores: { novelty: 3, fit: 3, buildable: 3, scope: 3 },
      success_criteria: [],
      prior_art: { twist: "t", sources: [] },
    }),
  ).toThrow(/success_criteria/);
});

test("validateTriagePayload rejects missing twist (the differentiator is load-bearing)", () => {
  expect(() =>
    validateTriagePayload({
      scores: { novelty: 3, fit: 3, buildable: 3, scope: 3 },
      success_criteria: ["x"],
      prior_art: { twist: "", sources: [] },
    } as any),
  ).toThrow(/twist/);
});
