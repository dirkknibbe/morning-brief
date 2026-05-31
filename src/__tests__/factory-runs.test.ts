import { test, expect } from "bun:test";
import { buildRunDoc, buildRoundEntry } from "../factory-runs";
import type { Classification } from "../criteria-classify";

const CLASS: Classification[] = [
  { text: "exposes scene()", kind: "scriptable", rationale: "x" },
  { text: "returns stable id", kind: "test", rationale: "x" },
  { text: "record two screencasts", kind: "human_or_external", rationale: "x" },
];

test("buildRunDoc: initializes a run and derives human_handoff from classification", () => {
  const now = new Date("2026-05-31T12:00:00Z");
  const doc = buildRunDoc(
    { idea_slug: "uipe-skill", build_dir: ".claude/builds/uipe-skill", branch: "main", criteria_classification: CLASS },
    now,
  );
  expect(doc.idea_slug).toBe("uipe-skill");
  expect(doc.started_at).toEqual(now);
  expect(doc.ended_at).toBeNull();
  expect(doc.terminator).toBeNull();
  expect(doc.rounds).toBe(0);
  expect(doc.rounds_log).toEqual([]);
  expect(doc.human_handoff).toEqual(["record two screencasts"]);
  expect(doc.cost_usd).toBeNull();
});

test("buildRoundEntry: truncates a long test-output excerpt", () => {
  const long = "x".repeat(5000);
  const entry = buildRoundEntry(3, 2, "try widening the band", long);
  expect(entry.n).toBe(3);
  expect(entry.failing_test_count).toBe(2);
  expect(entry.hypothesis).toBe("try widening the band");
  expect(entry.test_output_excerpt.length).toBeLessThanOrEqual(2000);
});
