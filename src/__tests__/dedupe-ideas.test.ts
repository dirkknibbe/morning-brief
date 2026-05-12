import { test, expect } from "bun:test";
import { decideUpsertOp, slugify } from "../dedupe-ideas";
import type { IdeaCandidate } from "../parse-ideas";

const candidate: IdeaCandidate = {
  title: "MCP Auth Bridge",
  raw_text: "Build a bridge for OAuth to MCP servers",
  source_file: "briefs/2026-04-09.md",
  source_section: "Opportunity Sparks",
  theme_hints: [],
  extracted_at: new Date("2026-04-09T07:00:00Z"),
};

test("slugify: kebab-cases and truncates to 6 words", () => {
  expect(slugify("MCP Auth Bridge!")).toBe("mcp-auth-bridge");
  expect(slugify("Build a tiny proxy for OAuth handshakes today and tomorrow"))
    .toBe("build-a-tiny-proxy-for-oauth");
});

test("slugify: strips punctuation and collapses whitespace", () => {
  expect(slugify("Hello,   world!  Foo.")).toBe("hello-world-foo");
});

test("decideUpsertOp: no existing → insert new doc with defaults", () => {
  const op = decideUpsertOp(candidate, "hash1", null);
  expect(op.kind).toBe("insert");
  if (op.kind !== "insert") return;
  expect(op.doc.slug).toBe("mcp-auth-bridge");
  expect(op.doc.signal_strength).toBe(1);
  expect(op.doc.status).toBe("extracted");
  expect(op.doc.kind).toBe("simple");
  expect(op.doc.synthesis_depth).toBe(0);
  expect(op.doc.parents).toBeNull();
  expect(op.doc.success_criteria).toBeNull();
  expect(op.doc.attempts).toBe(0);
  expect(op.doc.sources).toEqual([
    { brief: "briefs/2026-04-09.md", section: "Opportunity Sparks" },
  ]);
});

test("decideUpsertOp: existing hash match with new source → reinforce", () => {
  const existing = {
    slug: "mcp-auth-bridge",
    content_hash: "hash1",
    signal_strength: 1,
    sources: [{ brief: "briefs/2026-04-08.md", section: "Opportunity Sparks" }],
  };
  const op = decideUpsertOp(candidate, "hash1", existing);
  expect(op.kind).toBe("reinforce");
  if (op.kind !== "reinforce") return;
  expect(op.slug).toBe("mcp-auth-bridge");
  expect(op.new_source).toEqual({
    brief: "briefs/2026-04-09.md",
    section: "Opportunity Sparks",
  });
});

test("decideUpsertOp: existing match, same source already recorded → skip", () => {
  const existing = {
    slug: "mcp-auth-bridge",
    content_hash: "hash1",
    signal_strength: 1,
    sources: [{ brief: "briefs/2026-04-09.md", section: "Opportunity Sparks" }],
  };
  const op = decideUpsertOp(candidate, "hash1", existing);
  expect(op.kind).toBe("skip");
});
