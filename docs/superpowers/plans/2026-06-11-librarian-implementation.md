# The Librarian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make research from the brief's daily action item compound: distill it into a topic-keyed `library/` of markdown entries, index them in Mongo with local embeddings, and let synthesize ground its judgments on them (with `library_refs` provenance flowing to triage and factory).

**Architecture:** Evolve the existing action-research loop (no new launchd job): after the dossier, the agent writes/updates a `library/<topic-slug>.md` entry and runs `bun run library upsert`. Git is the source of truth; the Mongo `library` collection is a rebuildable index (`reindex`). Synthesize calls `bun run library relevant --text ...` per cluster as best-effort grounding and records used refs via `insert-synthesis --library-refs`. Also hardens `parse-action.ts` (the loop's front door) against its known mid-prose false-match bug.

**Tech Stack:** Bun 1.3.14 (runtime + `bun test` + `Bun.YAML.parse`), TypeScript ESM, MongoDB driver v7, `@xenova/transformers` local embeddings (`src/embeddings.ts`: `embed()` → 384-dim Float32Array, `cosine()`).

**Spec:** `docs/superpowers/specs/2026-06-11-librarian-design.md` (validated 2026-06-11).
**Branch:** `claude/librarian` (this worktree). PRs target `main`.

**Spec deviation (documented):** the spec's parse-action fix said "drop `/i`" — but the live 2026-06-12 marker is `🎯 *Today's action:*` (lowercase "action" inside the bold), so dropping case-insensitivity would break real briefs. The actual fix: line-start anchor + require a colon in/after the bold marker, keep case-insensitive "action". The spec's "repeated flag" for `--library-refs` is implemented comma-separated to match the `--parents` house style.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/parse-action.ts` | modify | Pure `parseActionFromBody()` (new) + file-reading `parseAction()` wrapper; hardened marker matching |
| `src/__tests__/parse-action.test.ts` | create | Regression + behavior tests for both live marker variants and the 06-05 garbage bug |
| `src/cli-args.ts` | create | Shared `parseFlagArgs()` (moved from ideas-state.ts so library.ts can reuse it) |
| `src/library-entry.ts` | create | Pure: frontmatter parse/validate (`parseLibraryEntry`), `embedText`, `rankBySimilarity` |
| `src/__tests__/library-entry.test.ts` | create | Entry parsing/validation + ranking tests |
| `src/library.ts` | create | CLI (`upsert`/`relevant`/`list`/`reindex`) + Mongo I/O — thin, mirrors ideas-state.ts CLI pattern |
| `src/ideas-state.ts` | modify | `buildSynthesisDoc` gains `libraryRefs`; `insert-synthesis` parses/validates `--library-refs`; import `parseFlagArgs` from cli-args |
| `src/__tests__/ideas-state.test.ts` | modify | Two new `buildSynthesisDoc` tests (default + passthrough) |
| `scripts/init-db.ts` | modify | `library` collection + validator + unique slug index; `library_refs` added to IDEAS_VALIDATOR |
| `package.json` | modify | `"library": "bun run src/library.ts"` script |
| `triggers/action-research.md` | modify | Distill + index steps, Discord wording, env list |
| `triggers/synthesize.md` | modify | Grounding step + `--library-refs` + guardrail |
| `triggers/factory.md` | modify | Step 1 reads `library_refs` entries into build context |

Conventions honored: `bun test` (bun:test imports), small focused files, immutable doc-building (mirror `buildSynthesisDoc`), no new launchd jobs, no RunAtLoad changes, commits without Claude attribution.

---

### Task 1: Harden parse-action (the loop's front door)

The current regex (`src/parse-action.ts:33`) matches bold spans anywhere in a line, case-insensitively — on 2026-06-05 it captured mid-paragraph garbage and exited 0. Fix: scan line-by-line; a marker line must (a) start with optional symbol/emoji prefixes then a bold span, (b) contain "action" (case-insensitive, whole word) inside the bold, (c) have a colon inside or immediately after the bold. Both live variants pass; mid-prose emphasis and colon-less bullets don't.

**Files:**
- Modify: `src/parse-action.ts`
- Create: `src/__tests__/parse-action.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/parse-action.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAction, parseActionFromBody } from "../parse-action";

const PATH = "briefs/test.md";

test("parses the 2026-06-10 marker variant (*Action today:*)", () => {
  const body =
    "Intro line.\n\n*Action today:* Read withlore.ai's gateway + recall-tool design — map their pricing wedge.\n\nfooter\n";
  expect(parseActionFromBody(body, PATH)).toBe(
    "Read withlore.ai's gateway + recall-tool design — map their pricing wedge.",
  );
});

test("parses the 2026-06-12 marker variant (🎯 *Today's action:*)", () => {
  const body =
    "🔥 *Hot Signals*\n• stuff\n\n🎯 *Today's action:* `pip install state-harness`, wrap a 10-turn UIPE loop.\n";
  expect(parseActionFromBody(body, PATH)).toBe(
    "`pip install state-harness`, wrap a 10-turn UIPE loop.",
  );
});

test("regression: mid-prose bold emphasis containing 'action' does not match (2026-06-05 bug)", () => {
  const body =
    "*Lead:* The *agentic action* pattern trended today — tools everywhere.\n\nNo marker in this brief.\n";
  expect(() => parseActionFromBody(body, PATH)).toThrow(/No "Action today" block/);
});

test("bullet with action-bearing bold but no colon does not match", () => {
  const body = "• *Action replay for agents* — replay tooling for agent runs.\n";
  expect(() => parseActionFromBody(body, PATH)).toThrow();
});

test("captures continuation lines until the first blank line", () => {
  const body = "*Action today:* First line\nsecond line continues\n\nNot captured.\n";
  expect(parseActionFromBody(body, PATH)).toBe("First line\nsecond line continues");
});

test("double-asterisk bold marker works", () => {
  const body = "**Action today:** Do the thing.\n";
  expect(parseActionFromBody(body, PATH)).toBe("Do the thing.");
});

test("colon after the closing asterisks also counts", () => {
  const body = "*Action today*: Do the thing.\n";
  expect(parseActionFromBody(body, PATH)).toBe("Do the thing.");
});

test("parseAction reads <date>.md and prefers <date>-rerun.md", () => {
  const dir = mkdtempSync(join(tmpdir(), "briefs-"));
  writeFileSync(join(dir, "2026-06-10.md"), "*Action today:* base file\n");
  expect(parseAction("2026-06-10", dir).action).toBe("base file");
  writeFileSync(join(dir, "2026-06-10-rerun.md"), "*Action today:* rerun file\n");
  expect(parseAction("2026-06-10", dir).action).toBe("rerun file");
});

test("throws when no brief file exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "briefs-"));
  expect(() => parseAction("2026-01-01", dir)).toThrow(/No brief found/);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun test src/__tests__/parse-action.test.ts`
Expected: FAIL — `parseActionFromBody` is not exported yet (compile error). That alone is RED; the two regression tests (mid-prose, colon-less bullet) encode behavior the OLD regex gets wrong (it returns garbage instead of throwing).

- [ ] **Step 3: Implement the hardened parser**

In `src/parse-action.ts`, replace the regex + body of `parseAction` (keep imports, `ParsedAction`, and the `import.meta.main` block; update the header comment's prose to describe the marker rule):

```ts
/**
 * A marker line must:
 *   - start at line start (optional emoji/symbol prefixes allowed, e.g. "🎯 "),
 *   - contain a bold span (*...* or **...**) whose text contains the word
 *     "action" (case-insensitive), and
 *   - have a colon inside the bold or immediately after it.
 * The action text is the remainder of that line plus following lines up to
 * the first blank line. Mid-paragraph *emphasis* can no longer match
 * (2026-06-05 garbage-capture bug).
 */
const MARKER =
  /^[^\S\n]*(?:[^\w\s*][^\S\n]*)*\*{1,2}([^*\n]*)\*{1,2}[^\S\n]*(:?)/i;

export function parseActionFromBody(body: string, briefPath: string): string {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(MARKER);
    if (!m) continue;
    const boldInner = m[1];
    const hasAction = /\baction\b/i.test(boldInner);
    const hasColon = boldInner.includes(":") || m[2] === ":";
    if (!hasAction || !hasColon) continue;

    const sameLine = lines[i].slice(m[0].length).replace(/^:/, "").trim();
    const rest: string[] = sameLine ? [sameLine] : [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") break;
      rest.push(lines[j]);
    }
    const action = rest.join("\n").trim();
    if (action) return action;
  }
  throw new Error(`No "Action today" block in ${briefPath}`);
}

export function parseAction(date: string, briefsDir = "briefs"): ParsedAction {
  const candidates = [
    join(briefsDir, `${date}-rerun.md`),
    join(briefsDir, `${date}.md`),
  ];
  const briefPath = candidates.find((p) => existsSync(p));
  if (!briefPath) throw new Error(`No brief found for ${date} (tried ${candidates.join(", ")})`);

  const body = readFileSync(briefPath, "utf8");
  return { date, briefPath, action: parseActionFromBody(body, briefPath) };
}
```

Note: `m[0]` already swallows a colon adjacent to the closing asterisks (group 2); the `.replace(/^:/, "")` is belt-and-braces for spacing variants like `*Action today* : text`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test src/__tests__/parse-action.test.ts`
Expected: all 9 pass.

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: everything green (nothing else imports parse-action; action-research consumes the CLI).

- [ ] **Step 6: Commit**

```bash
git add src/parse-action.ts src/__tests__/parse-action.test.ts
git commit -m "fix(parse-action): anchor action marker at line start, require colon

Mid-paragraph *emphasis* containing 'action' could match and exit 0 with
garbage (2026-06-05 brief). Marker now must start the line (emoji prefix ok),
carry the word 'action' inside the bold, and have a colon in/after it. Both
live variants (*Action today:* / 🎯 *Today's action:*) covered by tests."
```

---

### Task 2: Pure library-entry module (frontmatter parse + ranking)

**Files:**
- Create: `src/library-entry.ts`
- Create: `src/__tests__/library-entry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/library-entry.test.ts`:

```ts
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
```

(Frontmatter dates are quoted in the canonical template — unquoted YAML dates can parse as `Date` objects; the parser stays strict and the templates quote.)

- [ ] **Step 2: Run tests — expect FAIL (module doesn't exist)**

Run: `bun test src/__tests__/library-entry.test.ts`
Expected: FAIL — cannot resolve `../library-entry`.

- [ ] **Step 3: Implement `src/library-entry.ts`**

```ts
/**
 * library-entry.ts — pure parsing/validation/ranking for research-library
 * entries. No I/O; library.ts is the I/O layer (mirrors the
 * dedupe-ideas.ts / ideas-state.ts split).
 *
 * Entry contract (docs/superpowers/specs/2026-06-11-librarian-design.md):
 * YAML frontmatter with slug/title/summary/tags/sources/first_read/
 * last_updated/runs, then a markdown body. Parsed with Bun.YAML (no
 * dependency); format constrained — inline arrays, single-line scalars,
 * quoted dates — and validated hard here.
 */

import { cosine } from "./embeddings";

export interface LibraryEntry {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  sources: string[];
  first_read: string;
  last_updated: string;
  runs: string[];
  body: string;
}

export interface IndexedEntry {
  slug: string;
  title: string;
  path: string;
  summary: string;
  embedding: number[];
}

export interface RankedEntry {
  slug: string;
  title: string;
  path: string;
  summary: string;
  score: number;
}

const SLUG_RE = /^[a-z0-9-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLibraryEntry(md: string, path: string): LibraryEntry {
  if (!md.startsWith("---\n")) throw new Error(`${path}: missing frontmatter open delimiter`);
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) throw new Error(`${path}: missing frontmatter close delimiter`);
  const front = md.slice(4, end + 1);
  const body = md.slice(end + 5).trim();

  let raw: unknown;
  try {
    raw = Bun.YAML.parse(front);
  } catch (e) {
    throw new Error(`${path}: invalid YAML frontmatter: ${(e as Error).message}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: frontmatter must be a YAML mapping`);
  }
  const f = raw as Record<string, unknown>;

  const str = (k: string): string => {
    const v = f[k];
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`${path}: frontmatter "${k}" must be a non-empty string`);
    }
    return v.trim();
  };
  const strArr = (k: string): string[] => {
    const v = f[k];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      throw new Error(`${path}: frontmatter "${k}" must be an array of strings`);
    }
    return v as string[];
  };
  const dateStr = (k: string): string => {
    const v = str(k);
    if (!DATE_RE.test(v)) throw new Error(`${path}: frontmatter "${k}" must be YYYY-MM-DD`);
    return v;
  };

  const slug = str("slug");
  if (!SLUG_RE.test(slug)) throw new Error(`${path}: slug must match ${SLUG_RE} (got "${slug}")`);
  if (body === "") throw new Error(`${path}: entry body is empty`);

  return {
    slug,
    title: str("title"),
    summary: str("summary"),
    tags: strArr("tags"),
    sources: strArr("sources"),
    first_read: dateStr("first_read"),
    last_updated: dateStr("last_updated"),
    runs: strArr("runs"),
    body,
  };
}

export function embedText(e: LibraryEntry): string {
  return `${e.title}\n${e.summary}\n${e.body}`;
}

export function rankBySimilarity(
  query: Float32Array,
  entries: ReadonlyArray<IndexedEntry>,
  k: number,
): RankedEntry[] {
  return entries
    .map((e) => ({
      slug: e.slug,
      title: e.title,
      path: e.path,
      summary: e.summary,
      score: Math.round(cosine(query, Float32Array.from(e.embedding)) * 1000) / 1000,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, k));
}
```

(If `Bun.YAML` types are missing under the installed `@types/bun`, use `(Bun as unknown as { YAML: { parse(s: string): unknown } }).YAML.parse` — runtime verified present on bun 1.3.14.)

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test src/__tests__/library-entry.test.ts`
Expected: all 10 pass.

- [ ] **Step 5: Commit**

```bash
git add src/library-entry.ts src/__tests__/library-entry.test.ts
git commit -m "feat(library): pure entry parsing, validation, and similarity ranking"
```

---

### Task 3: `bun run library` CLI + Mongo index + init-db

**Files:**
- Create: `src/cli-args.ts`
- Create: `src/library.ts`
- Modify: `src/ideas-state.ts` (replace local `parseFlagArgs`, ~lines 292-308)
- Modify: `scripts/init-db.ts`
- Modify: `package.json`

- [ ] **Step 1: Extract `parseFlagArgs` to `src/cli-args.ts`**

Create `src/cli-args.ts` (verbatim move from `src/ideas-state.ts:292-308`):

```ts
/**
 * cli-args.ts — tiny shared `--flag value` parser for the bun-run CLIs.
 * A bare `--flag` (no value following) is recorded as "true".
 */
export function parseFlagArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        out[key] = val;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}
```

In `src/ideas-state.ts`: delete the local `function parseFlagArgs(...)` and add `import { parseFlagArgs } from "./cli-args";` to the imports.

Run: `bun test` — Expected: full suite green (pure refactor).

- [ ] **Step 2: Implement `src/library.ts`**

```ts
/**
 * library.ts — research-library CLI: index library/*.md into Mongo, retrieve
 * by similarity. Pure logic lives in library-entry.ts; this file is the I/O
 * layer (mirrors the dedupe-ideas.ts / ideas-state.ts split).
 *
 * Modes:
 *   upsert <path>                — parse + embed one entry, upsert by slug
 *   relevant --text <t> [--k 3]  — top-K entries by cosine similarity (JSON)
 *   list                         — all entries {slug,title,last_updated} (JSON)
 *   reindex                      — upsert every library/*.md (recovery/backfill)
 *
 * Contract: git (library/*.md) is the source of truth; the Mongo `library`
 * collection is a REBUILDABLE index. Trigger callers treat upsert failures
 * as warnings, never aborts.
 */

import { MongoClient, type Db } from "mongodb";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { embed } from "./embeddings";
import { parseFlagArgs } from "./cli-args";
import {
  parseLibraryEntry,
  embedText,
  rankBySimilarity,
  type IndexedEntry,
} from "./library-entry";

const SCHEMA_VERSION = 1;

export async function upsertEntry(db: Db, path: string): Promise<string> {
  const md = readFileSync(path, "utf8");
  const entry = parseLibraryEntry(md, path);
  const vec = await embed(embedText(entry));
  await db.collection("library").updateOne(
    { slug: entry.slug },
    {
      $set: {
        title: entry.title,
        summary: entry.summary,
        tags: entry.tags,
        sources: entry.sources,
        path,
        embedding: Array.from(vec),
        first_read: entry.first_read,
        last_updated: entry.last_updated,
        runs: entry.runs,
        schema_version: SCHEMA_VERSION,
        indexed_at: new Date(),
      },
    },
    { upsert: true },
  );
  return entry.slug;
}

// CLI
if (import.meta.main) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("library: MONGODB_URI is not set");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB ?? "morning-brief";
  const mode = process.argv[2];
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);

    if (mode === "upsert") {
      const path = process.argv[3];
      if (!path) { console.error("usage: library upsert <path>"); process.exit(1); }
      const slug = await upsertEntry(db, path);
      console.log(`✓ indexed ${slug} (${path})`);
    } else if (mode === "relevant") {
      const args = parseFlagArgs(process.argv.slice(3));
      const text = args.text;
      if (!text || text === "true") { console.error("relevant: --text is required"); process.exit(1); }
      const k = Number(args.k ?? "3");
      if (!Number.isFinite(k) || k < 1) { console.error("relevant: --k must be a positive number"); process.exit(1); }
      const docs = (await db
        .collection("library")
        .find({}, { projection: { _id: 0, slug: 1, title: 1, path: 1, summary: 1, embedding: 1 } })
        .toArray()) as unknown as IndexedEntry[];
      const query = await embed(text);
      console.log(JSON.stringify(rankBySimilarity(query, docs, k), null, 2));
    } else if (mode === "list") {
      const docs = await db
        .collection("library")
        .find({}, { projection: { _id: 0, slug: 1, title: 1, last_updated: 1 } })
        .sort({ last_updated: -1 })
        .toArray();
      console.log(JSON.stringify(docs, null, 2));
    } else if (mode === "reindex") {
      if (!existsSync("library")) {
        console.log("(no library/ directory — nothing to index)");
      } else {
        const files = readdirSync("library").filter((f) => f.endsWith(".md")).sort();
        for (const f of files) {
          const slug = await upsertEntry(db, join("library", f));
          console.log(`✓ ${slug}`);
        }
        console.log(`reindexed ${files.length} entr${files.length === 1 ? "y" : "ies"}`);
      }
    } else {
      console.error("usage: library <upsert|relevant|list|reindex> [args]");
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}
```

Testing note: CLI dispatch + Mongo I/O stays deliberately thin and unit-untested — same precedent as ideas-state.ts (tests cover pure functions). Pure logic was tested in Task 2; the I/O path is exercised live in Task 7 (backfill + acceptance).

- [ ] **Step 3: Register the script in `package.json`**

After `"ideas": "bun run src/ideas-state.ts",` add:

```json
    "library": "bun run src/library.ts",
```

- [ ] **Step 4: Add the `library` collection to `scripts/init-db.ts`**

(a) After `IDEAS_VALIDATOR`, add:

```ts
const LIBRARY_VALIDATOR = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "slug", "title", "summary", "tags", "sources", "path",
      "embedding", "first_read", "last_updated", "runs", "schema_version",
    ],
    properties: {
      slug: { bsonType: "string", minLength: 1 },
      title: { bsonType: "string", minLength: 1 },
      summary: { bsonType: "string", minLength: 1 },
      tags: { bsonType: "array" },
      sources: { bsonType: "array" },
      path: { bsonType: "string", minLength: 1 },
      embedding: { bsonType: "array", minItems: 384, maxItems: 384 },
      first_read: { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      last_updated: { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      runs: { bsonType: "array" },
      schema_version: { bsonType: ["int", "long", "double"] },
      indexed_at: { bsonType: "date" },
    },
  },
};
```

(b) Add `"library"` to the `collections` array (~line 111).

(c) After the ideas index/validator blocks (~line 159), add — copying the exact collMod option shape of the existing ideas block:

```ts
  await db.collection("library").createIndex({ slug: 1 }, { unique: true });
  console.log("✓ library indexes");

  await db.command({
    collMod: "library",
    validator: LIBRARY_VALIDATOR,
    validationAction: "error",
    validationLevel: "moderate",
  });
  console.log("✓ library validator (error action, moderate level)");
```

- [ ] **Step 5: Typecheck + full suite**

Run: `bunx tsc --noEmit` (only if `tsconfig.json` exists at repo root) and `bun test`
Expected: clean / all green.

- [ ] **Step 6: Commit**

```bash
git add src/cli-args.ts src/library.ts src/ideas-state.ts scripts/init-db.ts package.json
git commit -m "feat(library): bun run library CLI (upsert/relevant/list/reindex) + Mongo index

Git library/*.md is the source of truth; the Mongo library collection is a
rebuildable index (384-dim local MiniLM embeddings). parseFlagArgs extracted
to cli-args.ts for reuse."
```

---

### Task 4: `insert-synthesis --library-refs` (provenance on synthesis ideas)

**Files:**
- Modify: `src/ideas-state.ts` (`buildSynthesisDoc` ~line 210; `insert-synthesis` mode ~line 354)
- Modify: `scripts/init-db.ts` (IDEAS_VALIDATOR properties)
- Modify: `src/__tests__/ideas-state.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/ideas-state.test.ts` (merge the type import into the existing `../ideas-state` import):

```ts
import type { SynthesisParent } from "../ideas-state";

const refParent = (slug: string): SynthesisParent => ({
  slug,
  signal_strength: 1,
  synthesis_depth: 0,
  theme_hints: [],
  status: "extracted",
});

test("buildSynthesisDoc defaults library_refs to []", () => {
  const doc = buildSynthesisDoc({
    title: "test synthesis",
    thesis: "a thesis",
    parents: [refParent("a"), refParent("b")],
    now: new Date("2026-06-12T00:00:00Z"),
    rawText: "raw",
  });
  expect(doc.library_refs).toEqual([]);
});

test("buildSynthesisDoc carries provided library refs", () => {
  const doc = buildSynthesisDoc({
    title: "test synthesis",
    thesis: "a thesis",
    parents: [refParent("a"), refParent("b")],
    now: new Date("2026-06-12T00:00:00Z"),
    rawText: "raw",
    libraryRefs: ["withlore-ai-gateway"],
  });
  expect(doc.library_refs).toEqual(["withlore-ai-gateway"]);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test src/__tests__/ideas-state.test.ts`
Expected: FAIL — `library_refs` undefined / `libraryRefs` not an accepted arg.

- [ ] **Step 3: Implement**

(a) `buildSynthesisDoc` (~line 210): add `libraryRefs?: string[];` to the args type, destructure it, and add to the returned doc next to `parents`:

```ts
    library_refs: libraryRefs ?? [],
```

(b) `insert-synthesis` mode (~line 354), after the `rawText` assignment and before the parents lookup:

```ts
      const libraryRefs = (args["library-refs"] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const badRefs = libraryRefs.filter((r) => !/^[a-z0-9-]+$/.test(r));
      if (badRefs.length > 0) {
        console.error("insert-synthesis: invalid --library-refs slug(s):", badRefs.join(", "));
        process.exit(1);
      }
      if (libraryRefs.length > 0) {
        const found = await db
          .collection("library")
          .find({ slug: { $in: libraryRefs } }, { projection: { slug: 1 } })
          .toArray();
        const foundSet = new Set(found.map((d) => d.slug));
        const unknown = libraryRefs.filter((r) => !foundSet.has(r));
        if (unknown.length > 0) {
          console.error(
            `insert-synthesis: warning — library ref(s) not in index (proceeding): ${unknown.join(", ")}`,
          );
        }
      }
```

and pass `libraryRefs,` into the `buildSynthesisDoc({...})` call.

(c) `scripts/init-db.ts` IDEAS_VALIDATOR `properties` (next to `parents`):

```ts
      library_refs: { bsonType: ["array", "null"] },
```

(The validator has no `additionalProperties: false` — verified — so existing docs stay valid; the property is declared for documentation. Intentionally NOT in `required`: pre-existing ideas lack it.)

- [ ] **Step 4: Run — expect PASS, then full suite**

Run: `bun test src/__tests__/ideas-state.test.ts` then `bun test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/ideas-state.ts src/__tests__/ideas-state.test.ts scripts/init-db.ts
git commit -m "feat(ideas): insert-synthesis --library-refs provenance

Comma-separated like --parents. Slug format validated hard; existence in the
library index checked soft (warn, proceed) — refs are provenance, not FKs."
```

---

### Task 5: Trigger prompt edits (action-research, synthesize, factory)

Prompt files — no unit tests. Verification = proofread against this plan + live acceptance in Task 7.

**Files:**
- Modify: `triggers/action-research.md`
- Modify: `triggers/synthesize.md`
- Modify: `triggers/factory.md`

- [ ] **Step 1: `triggers/action-research.md`**

(a) Intro paragraph: "ping Telegram with the result" → "ping Discord with the result".

(b) Tools list, after the `Write` bullet:

```markdown
- `bun run library list` / `bun run library upsert <path>` — research-library index (steps 5-6).
```

(c) Insert after `### 4. Write the dossier` (old sections 5/6/7 renumber to 7/8/9):

````markdown
### 5. Distill into the research library

Skip this step and step 6 only when the classification is **human**.

The dossier above is the dated run report. The library entry is different: topic-keyed
reference knowledge for future agents (synthesize grounds its judgments on these).
First check whether the topic already has an entry:

```bash
bun run library list
```

If an entry for this topic/artifact exists, UPDATE that file: merge new findings into
its sections, bump `last_updated`, append today's dossier path to `runs`. Do NOT
create a second slug for the same topic.

Otherwise `Write` a new `library/<topic-slug>.md` — slug matches `^[a-z0-9-]+$`, named
for the artifact or topic (e.g. `withlore-ai-gateway`), never dated:

```markdown
---
slug: <topic-slug>
title: <artifact/topic name>
summary: <2-3 sentences; shown verbatim in retrieval results>
tags: [<2-5 free-form kebab-case tags>]
sources: ["<url>", "<url>"]
first_read: "<today YYYY-MM-DD>"
last_updated: "<today YYYY-MM-DD>"
runs: [actions/<today>-<slug>.md]
---

## What it is

## Design & architecture notes
<!-- the reference-grade meat; cite sources for claims -->

## Patterns worth stealing
<!-- applicability to Dirk's projects: UIPE, MCPAASTA, morning-brief itself -->

## Open questions
```

Dense, ≤800 words. Keep the frontmatter dates quoted.

### 6. Index the entry

```bash
bun run library upsert library/<topic-slug>.md
```

If this fails (e.g. Mongo unreachable): do NOT abort. The .md file is the source of
truth; `bun run library reindex` heals the index later. Note the failure in the
step-7 ping instead.
````

(d) Old `### 5. Ping Telegram` → `### 7. Ping Discord`; message template gains, after the "Full dossier:" line:

```
📚 Library: `library/<topic-slug>.md`
```

(variants: `📚 Library: skipped (human action)` / `⚠️ library index failed — entry committed, run reindex`).

(e) Old step 6 (commit) → `### 8.`, commands become:

```bash
git add actions/<today>-<slug>.md library/
git commit -m "action-research: <today> <slug>"
git push origin HEAD
```

(f) Old step 7 (on error) → `### 9.` (text unchanged).

(g) Environment section: replace the `TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID` bullet with `DISCORD_BOT_TOKEN`, `DISCORD_BRIEF_CHANNEL_ID`; change the Mongo bullet's "(not used in v1, but available)" to "(used by `bun run library upsert`)".

- [ ] **Step 2: `triggers/synthesize.md`**

(a) Tools list, replace both bullets:

```markdown
- `Bash` — run `bun run ideas cluster-candidates`, `bun run library relevant ...`,
  `cat library/<slug>.md`, and `bun run ideas insert-synthesis ...`.
- (No web fetches. Synthesize is internal-only — the research library is local files
  + our own Mongo, so reading it does not violate this.)
```

(b) In `### 2. Per-cluster judgment`, after "For each cluster:" insert:

````markdown
First, ground the cluster against the research library:

```bash
bun run library relevant --text "<the cluster's idea titles + first raw_text lines, joined with newlines>" --k 3
```

Output: JSON array of `{ slug, title, path, score, summary }` (empty array = no
library yet — fine). `score` is cosine similarity; ≥0.45 usually means worth a look,
but judge by the summary. `cat` any entry that looks genuinely relevant and use it as
grounding for the strictly-stronger judgment and the thesis. Track which entry slugs
you ACTUALLY used. This is best-effort: if the command errors, proceed ungrounded
exactly as before.
````

(c) In `### 3. Insert the synthesis`, extend the command:

```bash
bun run ideas insert-synthesis \
  --parents "<slug-a>,<slug-b>[,<slug-c>[,<slug-d>]]" \
  --title "<title>" \
  --thesis "<2-3 sentence thesis>" \
  --raw-text "<paragraph summary>" \
  [--library-refs "<entry-slug>[,<entry-slug>]"]
```

plus the sentence: "Pass `--library-refs` only for entries whose content actually shaped the thesis — refs are provenance, not decoration."

(d) Scope guardrails, add:

```markdown
- **Library grounding is optional input, never a gate.** A `library relevant` failure or an empty library must not block synthesis.
```

- [ ] **Step 3: `triggers/factory.md`**

In `## Step 1 — load and claim the idea`, extend the line-28 sentence ("…read the brief/action files in `sources` for context.") with:

```markdown
If the idea has a non-empty `library_refs`, also read each `library/<ref>.md` —
distilled research that shaped this idea; let it inform scaffolding and plan choices.
```

- [ ] **Step 4: Proofread**

Run: `git diff triggers/` and `grep -n "Telegram" triggers/action-research.md`
Check: contiguous step numbering 1-9; no stray "Telegram"; guardrails consistent.

- [ ] **Step 5: Commit**

```bash
git add triggers/action-research.md triggers/synthesize.md triggers/factory.md
git commit -m "feat(triggers): librarian loop — distill+index in action-research, grounding in synthesize, refs in factory"
```

---

### Task 6: Final verification + PR

- [ ] **Step 1: Full local gate**

Run: `bun test` → entire suite green. `bunx tsc --noEmit` if tsconfig.json exists → clean.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin claude/librarian
```

Open a PR to `main` titled `feat: the Librarian — research library loop` (GitHub MCP). Body: loop summary, links to spec + this plan, test plan (suite green; backfill + acceptance post-merge per Task 7), deploy note (re-run `bun run init-db` for the new collection/validator), and the parse-action hardening callout.

- [ ] **Step 3: Review gate**

Request code review per house workflow; address CRITICAL/HIGH before merge.

---

### Task 7: Rollout, backfill, live acceptance (supervised — after PR merge)

Operator checklist (not headless):

- [ ] **PR #9 first** (spec rollout step 1): decide the stray local `35fbd0f` on `fix/run-trigger-failure-detection` (recommended: `git checkout fix/run-trigger-failure-detection && git reset --hard 23a09cd` — origin already matches), then merge PR #9.
- [ ] **Merge this feature PR to `main`**, then sync rehearsal from the main worktree (`~/morning-brief`, on `rehearsal`): `git pull && git merge origin/main` — merge commit, NEVER reset rehearsal.
- [ ] **DB changes:** `bun run init-db` then `bun run verify-validator`.
  Expected: `✓ library indexes`, `✓ library validator (error action, moderate level)`, verify-validator passes.
- [ ] **Backfill (supervised):** for each of the 6 dossiers (`actions/2026-05-15-deer-flow-message-gateway-uipe.md`, `2026-05-16-mcp-provenance-wrapper.md`, `2026-05-20-uipe-enforra-affordance-policy.md`, `2026-05-28-cowagent-vaen-portability.md`, `2026-06-05-capability-registry-wedge.md`, `2026-06-08-mailgent-loomal-x402-plug.md`): read it, write `library/<topic-slug>.md` per the template, `bun run library upsert library/<topic-slug>.md`. Then on rehearsal: `git add library/ && git commit -m "library: backfill 6 entries from existing dossiers" && git push`.
  Verify: `bun run library list` → 6 entries; `bun run library relevant --text "x402 per-call agent payments" --k 3` → the mailgent/x402 entry ranks first.
- [ ] **Acceptance run (the evaporated withlore.ai read):** supervised session in the rehearsal worktree, follow `triggers/action-research.md` end-to-end but load the action with `bun run src/parse-action.ts 2026-06-10` (date arg targets the 06-10 brief; downstream uses the parser's JSON). Expected: `actions/<today>-<slug>.md` + `library/withlore-ai-gateway.md` (or the agent's slug choice) + `✓ indexed ...` + Discord ping in #brief with the 📚 line + commit pushed to rehearsal.
- [ ] **Synthesize grounding check:** next 07:25 scheduled run or a supervised manual run. Gate: the grounding step ran without blocking synthesize (log shows `bun run library relevant`). If a synthesis landed with refs: `bun run ideas show <slug>` → `library_refs` non-empty. An empty-refs day is acceptable.
- [ ] **Next-morning watch:** confirm the 07:00 action-research run files an entry unattended (#brief ping has the 📚 line; `bun run library list` grew).

---

## Self-review notes (done at plan-writing time)

- **Spec coverage:** storage (T2/T3), CLI surface (T3), synthesize grounding + refs (T4/T5), factory grounding (T5), parse-action hardening (T1), validator must-verify (T4 — confirmed: no `additionalProperties: false`, field declared explicitly), backfill + withlore acceptance (T7), error handling (upsert-fail = warn: T5 1c/6-section; relevant-fail = proceed: T5 2b), Discord wording (T5), no new launchd jobs (none). Deferred spec items stay deferred.
- **Spec deviations:** documented in header (marker case-sensitivity; comma-separated refs); spec amended in the same commit as this plan.
- **Type consistency:** `parseActionFromBody(body, briefPath): string`; `LibraryEntry`/`IndexedEntry`/`RankedEntry` defined T2, imported T3; `SynthesisParent` import in T4 tests matches the existing export; `buildSynthesisDoc` arg `libraryRefs?: string[]` ↔ doc field `library_refs`.
