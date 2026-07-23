import { test, expect } from "bun:test";
import { parseLibraryEntry, embedText, rankBySimilarity } from "../library-entry";

const VALID = `---
slug: withlore-ai-gateway
title: Lore.AI agent-memory gateway
summary: Agent-memory gateway with on-device vector search; recall tool is the wedge.
tags: [mcp-distribution, agent-memory]
sources: ["https://withlore.ai", "https://news.ycombinator.com/item?id=123"]
first_read: "2026-06-12"
last_updated: "2026-06-12"
runs: [actions/2026-06-12-withlore-read.md]
---

## What it is
Memory-as-a-proxy product.

## Patterns worth stealing
One-command install as distribution.
`;

test("parses a valid entry", () => {
  const e = parseLibraryEntry(VALID, "library/withlore-ai-gateway.md");
  expect(e.slug).toBe("withlore-ai-gateway");
  expect(e.title).toBe("Lore.AI agent-memory gateway");
  expect(e.tags).toEqual(["mcp-distribution", "agent-memory"]);
  expect(e.sources).toHaveLength(2);
  expect(e.runs).toEqual(["actions/2026-06-12-withlore-read.md"]);
  expect(e.body).toContain("## What it is");
});

test("embedText is title + summary + body", () => {
  const e = parseLibraryEntry(VALID, "p");
  expect(embedText(e).startsWith("Lore.AI agent-memory gateway\nAgent-memory gateway")).toBe(true);
  expect(embedText(e)).toContain("## Patterns worth stealing");
});

test("rejects a slug that violates ^[a-z0-9-]+$", () => {
  expect(() => parseLibraryEntry(VALID.replace("withlore-ai-gateway", "Bad Slug!"), "p")).toThrow(/slug/);
});

test("rejects missing frontmatter delimiters", () => {
  expect(() => parseLibraryEntry("no frontmatter here", "p")).toThrow(/frontmatter/);
});

test("rejects a missing required field", () => {
  const noSummary = VALID.replace(/^summary: .*\n/m, "");
  expect(() => parseLibraryEntry(noSummary, "p")).toThrow(/summary/);
});

test("rejects a malformed date", () => {
  expect(() =>
    parseLibraryEntry(VALID.replace('first_read: "2026-06-12"', 'first_read: "June 12"'), "p"),
  ).toThrow(/first_read/);
});

test("rejects an empty body", () => {
  const headerOnly = VALID.slice(0, VALID.indexOf("\n## What it is"));
  expect(() => parseLibraryEntry(headerOnly + "\n", "p")).toThrow(/body/);
});

test("rankBySimilarity orders by cosine desc and caps at k", () => {
  const q = Float32Array.from([1, 0]);
  const entries = [
    { slug: "far", title: "t", path: "p", summary: "s", embedding: [0, 1] },
    { slug: "near", title: "t", path: "p", summary: "s", embedding: [1, 0] },
    { slug: "mid", title: "t", path: "p", summary: "s", embedding: [0.7, 0.7] },
  ];
  const out = rankBySimilarity(q, entries, 2);
  expect(out.map((r) => r.slug)).toEqual(["near", "mid"]);
  expect(out[0].score).toBeGreaterThan(out[1].score);
});

test("rankBySimilarity returns [] for an empty index", () => {
  expect(rankBySimilarity(Float32Array.from([1, 0]), [], 3)).toEqual([]);
});
