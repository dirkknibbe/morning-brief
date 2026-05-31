import { test, expect } from "bun:test";
import { classifyCriterion, classifyAll } from "../criteria-classify";

// The seven real success_criteria from the first queued idea
// (uipe-as-skill-with-named-v0-harness-adapters).
const REAL = [
  "SKILL.md under 300 lines, defines two primitives: scene(target) and diff(before, after)",
  "perception.py exposes scene(url|tab_id) -> SceneGraph and diff(before, after) -> DiffReport — callable from Python with no 12-tool MCP wrapper",
  "Skill loads via the Skill tool in Claude Code (matches Anthropic skill manifest schema)",
  "scene() against a known DOM-rerender page returns same node identity for the moved element across reruns (semantic stability assertion)",
  "AgentHandover adapter stub: 30-line Python file showing how an AgentHandover pixel-observation step can consume scene() output instead of a screenshot",
  "ClankerView adapter stub: 30-line snippet showing how a ClankerView assertion can consume diff() output instead of pixel comparison",
  "Two screencasts (one per partner) recorded and saved under demo/ before W26 Demo Day",
];

test("classifies the seven real criteria into the expected buckets", () => {
  const kinds = classifyAll(REAL).map((c) => c.kind);
  expect(kinds).toEqual([
    "scriptable",        // under 300 lines, defines
    "scriptable",        // exposes ... .py signature
    "human_or_external", // loads via Claude Code
    "test",              // returns same ... across reruns
    "scriptable",        // adapter stub / file
    "scriptable",        // adapter stub / snippet
    "human_or_external", // screencasts / demo day
  ]);
});

test("each result carries the original text and a non-empty rationale", () => {
  const out = classifyCriterion("perception.py exposes scene()");
  expect(out.text).toBe("perception.py exposes scene()");
  expect(out.kind).toBe("scriptable");
  expect(out.rationale.length).toBeGreaterThan(0);
});

test("unknown / vague criteria default to scriptable", () => {
  const out = classifyCriterion("the thing is good");
  expect(out.kind).toBe("scriptable");
  expect(out.rationale).toContain("defaulting");
});

test("human action verbs route to human_or_external", () => {
  expect(classifyCriterion("record a Loom walkthrough").kind).toBe("human_or_external");
  expect(classifyCriterion("sign up for the service and paste the token").kind).toBe("human_or_external");
  expect(classifyCriterion("manually verify the output looks right").kind).toBe("human_or_external");
});

test("behavioral assertions route to test", () => {
  expect(classifyCriterion("foo(2) returns 4").kind).toBe("test");
  expect(classifyCriterion("the parser is idempotent on re-run").kind).toBe("test");
});
