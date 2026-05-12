# Ideas Pipeline — Phase 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract candidate ideas from existing `briefs/*.md` and `actions/*.md`, persist them to a new MongoDB `ideas` collection with content-hash dedupe and signal-strength reinforcement, and expose `/ideas`, `/idea <slug>`, `/reject <slug>` commands through the Telegram listener.

**Architecture:** Pure parsing/dedupe functions backed by a thin Mongo CRUD module, driven by a one-shot `bun run extract-ideas` script that is idempotent. No embeddings, no LLM, no triage in this phase — those land in Phase 1b once we see a week of accumulated extractions. Tests follow the existing `bun:test` convention in `src/__tests__/`.

**Tech Stack:** Bun, TypeScript, MongoDB (existing `morning-brief` database), `bun:test`, `node:crypto`.

**Spec:** [docs/superpowers/specs/2026-05-11-ideas-pipeline-and-code-factory-design.md](../specs/2026-05-11-ideas-pipeline-and-code-factory-design.md). Phase 1a only — synthesize + triage are out of scope here.

**Out of scope for Phase 1a (deferred to Phase 1b):**
- `src/cluster-ideas.ts` (embeddings + mid-band clustering)
- `triggers/synthesize.md`
- `triggers/triage.md` (incl. prior-art web research)
- `/build`, `/abort`, `/factory-status` listener commands
- The factory and its lock collection

---

## File Map

**New files:**
- `src/content-hash.ts` — pure `contentHash(title, body)` SHA256 helper
- `src/parse-ideas.ts` — pure `parseIdeasFromBrief` + `parseIdeasFromAction`
- `src/dedupe-ideas.ts` — pure `decideUpsertOp` + `slugify` + types
- `src/ideas-state.ts` — Mongo CRUD + CLI (`list`, `show`, `set-status`)
- `src/extract-ideas.ts` — driver that wires parse → hash → dedupe → upsert
- `src/__tests__/content-hash.test.ts`
- `src/__tests__/parse-ideas.test.ts`
- `src/__tests__/dedupe-ideas.test.ts`

**Modified files:**
- `scripts/init-db.ts` — add `ideas` collection + indexes
- `triggers/listener.md` — add the three commands
- `scripts/loop-triggers.sh` — run `extract-ideas` after `action-research`
- `package.json` — add `extract-ideas` and `ideas` scripts

---

## Task 1: Add `ideas` collection to init-db

**Files:**
- Modify: `scripts/init-db.ts`

**Note:** No TDD for this one — `init-db.ts` is an idempotent configuration script with no existing test file. Verification = run it twice and check that the second run is a no-op.

- [ ] **Step 1: Modify the collections list**

In `scripts/init-db.ts`, change:

```ts
const collections = ["seen_items", "signals", "preferences"];
```

to:

```ts
const collections = ["seen_items", "signals", "preferences", "ideas"];
```

- [ ] **Step 2: Add ideas indexes**

Immediately after the existing `preferences` index block (right before the final `console.log("\nDone. ...")` line), add:

```ts
  await db.collection("ideas").createIndex({ slug: 1 }, { unique: true });
  await db.collection("ideas").createIndex({ content_hash: 1 });
  await db.collection("ideas").createIndex({ status: 1 });
  await db.collection("ideas").createIndex({ signal_strength: -1 });
  await db.collection("ideas").createIndex({ created_at: -1 });
  console.log("✓ ideas indexes");
```

- [ ] **Step 3: Run init-db twice — first creates, second is a no-op**

Run: `bun run init-db`
Expected (first run): `✓ created collection: ideas` then `✓ ideas indexes`.

Run again: `bun run init-db`
Expected (second run): `· collection already exists: ideas` then `✓ ideas indexes` (createIndex is idempotent by name).

- [ ] **Step 4: Commit**

```bash
git add scripts/init-db.ts
git commit -m "feat(init-db): add ideas collection and indexes"
```

---

## Task 2: contentHash pure function (TDD)

**Files:**
- Create: `src/content-hash.ts`
- Create: `src/__tests__/content-hash.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/content-hash.test.ts`:

```ts
import { test, expect } from "bun:test";
import { contentHash } from "../content-hash";

test("contentHash: identical input → identical hash", () => {
  const a = contentHash("MCP Auth", "Build a bridge for OAuth to MCP servers");
  const b = contentHash("MCP Auth", "Build a bridge for OAuth to MCP servers");
  expect(a).toBe(b);
});

test("contentHash: case differences collapse", () => {
  const a = contentHash("MCP Auth", "Build a bridge");
  const b = contentHash("mcp auth", "BUILD A BRIDGE");
  expect(a).toBe(b);
});

test("contentHash: punctuation differences collapse", () => {
  const a = contentHash("MCP Auth!", "Build a bridge.");
  const b = contentHash("MCP Auth", "Build a bridge");
  expect(a).toBe(b);
});

test("contentHash: distinct ideas → distinct hashes", () => {
  const a = contentHash("MCP Auth", "Build a bridge");
  const b = contentHash("Browser agents", "Selenium replacement");
  expect(a).not.toBe(b);
});

test("contentHash: returns 64-char hex string", () => {
  const h = contentHash("any", "thing");
  expect(h).toMatch(/^[0-9a-f]{64}$/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/__tests__/content-hash.test.ts`
Expected: 5 failing tests with "Cannot find module '../content-hash'" or similar.

- [ ] **Step 3: Write the minimal implementation**

Create `src/content-hash.ts`:

```ts
import { createHash } from "node:crypto";

/**
 * Stable content hash for an idea candidate.
 *
 * Normalizes case + punctuation so two briefs phrasing the same idea
 * slightly differently still collide. This is the *exact-hash* dedupe
 * layer; semantic (embedding) dedupe lives in a later phase.
 */
export function contentHash(title: string, body: string): string {
  const normalized = (title + "\n" + body)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/__tests__/content-hash.test.ts`
Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/content-hash.ts src/__tests__/content-hash.test.ts
git commit -m "feat(ideas): contentHash with case/punct-tolerant normalization"
```

---

## Task 3: parseIdeasFromBrief + parseIdeasFromAction (TDD)

**Files:**
- Create: `src/parse-ideas.ts`
- Create: `src/__tests__/parse-ideas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/parse-ideas.test.ts`:

```ts
import { test, expect } from "bun:test";
import { parseIdeasFromBrief, parseIdeasFromAction } from "../parse-ideas";

test("parseIdeasFromBrief: extracts Opportunity Sparks bullets", () => {
  const md = `intro paragraph

💡 *Opportunity Sparks*
- MCP auth bridge — connect OAuth flows to MCP servers
- Browser agent eval harness — Selenium-free testing for agents

🔥 *Hot Signals*
- something else
`;
  const result = parseIdeasFromBrief(md, "briefs/2026-04-09.md");
  const sparks = result.filter((r) => r.source_section === "Opportunity Sparks");
  expect(sparks.length).toBe(2);
  expect(sparks[0].raw_text).toContain("MCP auth bridge");
  expect(sparks[1].raw_text).toContain("Browser agent eval");
  expect(sparks[0].source_file).toBe("briefs/2026-04-09.md");
});

test("parseIdeasFromBrief: extracts Action for today line", () => {
  const md = `intro

**Action for today:** Build a tiny MCP auth proxy that handles OAuth for one provider.

next paragraph
`;
  const result = parseIdeasFromBrief(md, "briefs/2026-04-09.md");
  const actions = result.filter((r) => r.source_section === "Action for today");
  expect(actions.length).toBe(1);
  expect(actions[0].raw_text).toContain("MCP auth proxy");
});

test("parseIdeasFromBrief: tolerates emoji-prefixed Action variant", () => {
  const md = `🎯 **Action item for today:** Ship a one-pager for X.

end
`;
  const result = parseIdeasFromBrief(md, "briefs/2026-04-10.md");
  expect(result.some((r) => r.source_section === "Action for today")).toBe(true);
});

test("parseIdeasFromBrief: returns [] when no sparks/action present", () => {
  const md = "Just random text\n\nNo special sections.";
  expect(parseIdeasFromBrief(md, "briefs/empty.md")).toEqual([]);
});

test("parseIdeasFromAction: extracts Concrete next steps as numbered items", () => {
  const md = `## TL;DR
something

## Concrete next steps for Dirk
1. Write a smoke test against the public MCP server
2. Wire OAuth flow to a ngrok-tunneled callback URL
3. Document gotchas

## Open questions
- foo
`;
  const result = parseIdeasFromAction(md, "actions/2026-04-09-test.md");
  expect(result.length).toBe(3);
  expect(result[0].raw_text).toContain("smoke test");
  expect(result[2].raw_text).toContain("Document gotchas");
  expect(result[0].source_section).toBe("Concrete next steps");
});

test("parseIdeasFromAction: returns [] when no steps section present", () => {
  const md = "## TL;DR\nsomething\n\n## Open questions\n- foo";
  expect(parseIdeasFromAction(md, "actions/x.md")).toEqual([]);
});

test("parseIdeasFromBrief: title is truncated short summary of raw_text", () => {
  const md = `💡 *Opportunity Sparks*
- MCP auth bridge — connect OAuth flows to MCP servers for first-class agent authentication
`;
  const result = parseIdeasFromBrief(md, "briefs/x.md");
  expect(result[0].title.length).toBeLessThanOrEqual(80);
  expect(result[0].title).toContain("MCP auth bridge");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/__tests__/parse-ideas.test.ts`
Expected: 7 failing tests, module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `src/parse-ideas.ts`:

```ts
/**
 * parse-ideas.ts — extract candidate ideas from morning-brief markdown.
 *
 * Pure functions. No I/O, no Mongo. Used by extract-ideas.ts.
 */

export interface IdeaCandidate {
  title: string;
  raw_text: string;
  source_file: string;
  source_section: string;
  theme_hints: string[];
  extracted_at: Date;
}

function summarize(text: string, maxLen = 80): string {
  const firstClause = text.split(/[.—–-]/)[0].trim();
  return firstClause.length <= maxLen ? firstClause : firstClause.slice(0, maxLen).trim();
}

export function parseIdeasFromBrief(markdown: string, source_file: string): IdeaCandidate[] {
  const out: IdeaCandidate[] = [];
  const now = new Date();

  // 💡 *Opportunity Sparks* — bullets until next section marker or EOF.
  // Section markers in briefs are emoji + *Bold* on a line, or **Action for today**, or ## heading.
  const sparks = markdown.match(
    /💡\s*\*Opportunity Sparks\*\s*\n([\s\S]+?)(?=\n[🔥😤💰🛠️📈💡]\s*\*|\n\*{1,2}[^*\n]*Action\b|\n## |\n$)/i
  );
  if (sparks) {
    const lines = sparks[1].split("\n");
    for (const ln of lines) {
      const trimmed = ln.trim();
      if (!/^[-•]/.test(trimmed)) continue;
      const text = trimmed.replace(/^[-•]\s*/, "").trim();
      if (!text) continue;
      out.push({
        title: summarize(text),
        raw_text: text,
        source_file,
        source_section: "Opportunity Sparks",
        theme_hints: [],
        extracted_at: now,
      });
    }
  }

  // Action for today — re-uses the same tolerant regex from parse-action.ts.
  const actionRe = /\*{1,2}[^*\n]*\bAction\b[^*\n]*\*{1,2}\s*:?\s*([\s\S]+?)(?:\n\s*\n|$)/i;
  const action = markdown.match(actionRe);
  if (action) {
    const text = action[1].trim();
    out.push({
      title: summarize(text),
      raw_text: text,
      source_file,
      source_section: "Action for today",
      theme_hints: [],
      extracted_at: now,
    });
  }

  return out;
}

export function parseIdeasFromAction(markdown: string, source_file: string): IdeaCandidate[] {
  const out: IdeaCandidate[] = [];
  const now = new Date();

  // ## Concrete next steps for Dirk — numbered list "1. ...", "2. ..."
  const steps = markdown.match(
    /## Concrete next steps for Dirk\s*\n([\s\S]+?)(?=\n## |\n---|\n$)/i
  );
  if (steps) {
    // Split on newlines that start a new "N." item, then keep only numbered lines.
    const items = steps[1]
      .split(/\n(?=\s*\d+\.)/)
      .map((s) => s.trim())
      .filter((s) => /^\d+\./.test(s))
      .map((s) => s.replace(/^\d+\.\s*/, "").trim());
    for (const text of items) {
      if (!text) continue;
      out.push({
        title: summarize(text),
        raw_text: text,
        source_file,
        source_section: "Concrete next steps",
        theme_hints: [],
        extracted_at: now,
      });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/__tests__/parse-ideas.test.ts`
Expected: 7 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/parse-ideas.ts src/__tests__/parse-ideas.test.ts
git commit -m "feat(ideas): parseIdeasFromBrief and parseIdeasFromAction"
```

---

## Task 4: dedupe decision pure function (TDD)

**Files:**
- Create: `src/dedupe-ideas.ts`
- Create: `src/__tests__/dedupe-ideas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/dedupe-ideas.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/__tests__/dedupe-ideas.test.ts`
Expected: 5 failing tests, module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `src/dedupe-ideas.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/__tests__/dedupe-ideas.test.ts`
Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/dedupe-ideas.ts src/__tests__/dedupe-ideas.test.ts
git commit -m "feat(ideas): decideUpsertOp + slugify for content-hash dedupe"
```

---

## Task 5: ideas-state.ts CRUD module + CLI

**Files:**
- Create: `src/ideas-state.ts`

**Note:** No unit tests on this module — it is the Mongo I/O boundary. Covered by the integration smoke run in Task 6 (running `extract-ideas` end-to-end against the real DB).

- [ ] **Step 1: Write the module**

Create `src/ideas-state.ts`:

```ts
/**
 * ideas-state.ts — MongoDB CRUD for the ideas collection + CLI.
 *
 * Pure dedupe-decision logic lives in dedupe-ideas.ts; this file is the
 * I/O layer.
 *
 * CLI modes:
 *   list [status]               — print top-50 ideas (optionally filtered)
 *   show <slug>                 — print one idea as JSON
 *   set-status <slug> <status> [reason]
 *
 * Library exports for extract-ideas.ts:
 *   findIdeaByHash(db, hash) → ExistingIdea | null
 *   applyUpsertOp(db, op)
 *   listIdeas(db, { status?, limit? })
 *   getIdea(db, slug)
 *   setStatus(db, slug, status, reason?)
 */

import { MongoClient, type Db } from "mongodb";
import type { ExistingIdea, UpsertOp } from "./dedupe-ideas";

const VALID_STATUSES = new Set([
  "extracted",
  "queued",
  "building",
  "built",
  "parked",
  "rejected",
  "needs_human",
]);

export async function findIdeaByHash(db: Db, hash: string): Promise<ExistingIdea | null> {
  const doc = await db.collection("ideas").findOne({ content_hash: hash });
  if (!doc) return null;
  return {
    slug: doc.slug,
    content_hash: doc.content_hash,
    signal_strength: doc.signal_strength,
    sources: doc.sources ?? [],
  };
}

export async function applyUpsertOp(db: Db, op: UpsertOp): Promise<void> {
  if (op.kind === "skip") return;
  if (op.kind === "insert") {
    try {
      await db.collection("ideas").insertOne(op.doc as any);
    } catch (e: any) {
      // Duplicate key (race against a concurrent insert) — fall through.
      if (e.code !== 11000) throw e;
    }
    return;
  }
  // reinforce
  await db.collection("ideas").updateOne(
    { slug: op.slug },
    {
      $inc: { signal_strength: 1 },
      $push: { sources: op.new_source as any },
      $set: { updated_at: new Date() },
    },
  );
}

export async function listIdeas(
  db: Db,
  filter: { status?: string; limit?: number } = {},
): Promise<any[]> {
  const q: any = {};
  if (filter.status) q.status = filter.status;
  return db
    .collection("ideas")
    .find(q)
    .sort({ signal_strength: -1, created_at: -1 })
    .limit(filter.limit ?? 50)
    .toArray();
}

export async function getIdea(db: Db, slug: string): Promise<any | null> {
  return db.collection("ideas").findOne({ slug });
}

export async function setStatus(
  db: Db,
  slug: string,
  status: string,
  reason?: string,
): Promise<void> {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`invalid status: ${status} (valid: ${[...VALID_STATUSES].join(", ")})`);
  }
  const set: Record<string, unknown> = { status, updated_at: new Date() };
  if (reason) set.rejection_reason = reason;
  await db.collection("ideas").updateOne({ slug }, { $set: set });
}

// CLI
if (import.meta.main) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ideas-state: MONGODB_URI is not set");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB ?? "morning-brief";
  const mode = process.argv[2];
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);

    if (mode === "list") {
      const status = process.argv[3];
      const docs = await listIdeas(db, { status, limit: 50 });
      console.log(JSON.stringify(docs, null, 2));
    } else if (mode === "show") {
      const slug = process.argv[3];
      if (!slug) { console.error("usage: ideas-state show <slug>"); process.exit(1); }
      const doc = await getIdea(db, slug);
      if (!doc) { console.error(`no idea: ${slug}`); process.exit(1); }
      console.log(JSON.stringify(doc, null, 2));
    } else if (mode === "set-status") {
      const slug = process.argv[3];
      const status = process.argv[4];
      const reason = process.argv[5];
      if (!slug || !status) {
        console.error("usage: ideas-state set-status <slug> <status> [reason]");
        process.exit(1);
      }
      await setStatus(db, slug, status, reason);
      console.log(`✓ ${slug} → ${status}${reason ? ` (${reason})` : ""}`);
    } else {
      console.error("usage: ideas-state <list|show|set-status> [args]");
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}
```

- [ ] **Step 2: Type-check it**

Run: `bunx tsc --noEmit`
Expected: clean — no new TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/ideas-state.ts
git commit -m "feat(ideas): ideas-state CRUD module + CLI"
```

---

## Task 6: extract-ideas.ts driver + package.json scripts + smoke run

**Files:**
- Create: `src/extract-ideas.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the driver**

Create `src/extract-ideas.ts`:

```ts
/**
 * extract-ideas.ts — scan briefs/ and actions/, extract candidate ideas,
 * upsert to MongoDB `ideas` collection.
 *
 * Idempotent: re-running on the same files produces zero writes once
 * every (brief, section) pair has been recorded.
 *
 * Usage:
 *   bun run extract-ideas
 *   bun run extract-ideas --dry-run   (parse + summary, no Mongo writes)
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { parseIdeasFromBrief, parseIdeasFromAction, type IdeaCandidate } from "./parse-ideas";
import { contentHash } from "./content-hash";
import { decideUpsertOp } from "./dedupe-ideas";
import { findIdeaByHash, applyUpsertOp } from "./ideas-state";

function readDirMarkdown(dir: string): { path: string; body: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((n) => ({ path: join(dir, n), body: readFileSync(join(dir, n), "utf8") }));
}

const dryRun = process.argv.includes("--dry-run");
const uri = process.env.MONGODB_URI;
if (!uri && !dryRun) {
  console.error("extract-ideas: MONGODB_URI is not set (use --dry-run for parse-only)");
  process.exit(1);
}

const briefs = readDirMarkdown("briefs");
const actions = readDirMarkdown("actions");

const candidates: IdeaCandidate[] = [
  ...briefs.flatMap((f) => parseIdeasFromBrief(f.body, f.path)),
  ...actions.flatMap((f) => parseIdeasFromAction(f.body, f.path)),
];

const summary = {
  briefs_scanned: briefs.length,
  actions_scanned: actions.length,
  candidates: candidates.length,
  inserted: 0,
  reinforced: 0,
  skipped: 0,
};

if (dryRun) {
  console.log(
    JSON.stringify(
      { ...summary, sample: candidates.slice(0, 5).map((c) => ({ title: c.title, source: c.source_file, section: c.source_section })) },
      null,
      2,
    ),
  );
  process.exit(0);
}

const dbName = process.env.MONGODB_DB ?? "morning-brief";
const client = new MongoClient(uri!);
try {
  await client.connect();
  const db = client.db(dbName);

  for (const c of candidates) {
    const hash = contentHash(c.title, c.raw_text);
    const existing = await findIdeaByHash(db, hash);
    const op = decideUpsertOp(c, hash, existing);
    if (op.kind === "insert") summary.inserted++;
    else if (op.kind === "reinforce") summary.reinforced++;
    else summary.skipped++;
    await applyUpsertOp(db, op);
  }
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await client.close();
}
```

- [ ] **Step 2: Add npm scripts**

Modify `package.json` — in the `"scripts"` object, after the existing `"send:dry"` entry, add:

```json
    "extract-ideas": "bun run src/extract-ideas.ts",
    "ideas": "bun run src/ideas-state.ts",
```

The full scripts object should now look like:

```json
  "scripts": {
    "fetch": "bun run src/sources.ts",
    "reddit": "bun run src/reddit-fetch.ts",
    "web": "bun run src/web-fetch.ts",
    "send": "bun run src/telegram.ts",
    "send:dry": "bun run src/telegram.ts --dry-run",
    "extract-ideas": "bun run src/extract-ideas.ts",
    "ideas": "bun run src/ideas-state.ts",
    "init-db": "bun run scripts/init-db.ts",
    "test": "bun test"
  },
```

- [ ] **Step 3: Dry-run smoke test**

Run: `bun run extract-ideas --dry-run`
Expected: JSON summary with `briefs_scanned`, `actions_scanned`, non-zero `candidates`, and a `sample` array showing a few titles + source files. Should run in well under a second.

If candidates is 0, parsing is broken — re-check Task 3 fixtures against the actual brief markdown by reading one of `briefs/2026-04-09.md` or `briefs/2026-04-08.md`.

- [ ] **Step 4: Live smoke test (Mongo)**

Run: `bun run extract-ideas`
Expected: JSON summary with `inserted` matching `candidates` on the first run.

Re-run: `bun run extract-ideas`
Expected: `inserted: 0`, `reinforced: 0`, `skipped: <candidates>`. This verifies idempotency.

Then: `bun run ideas list`
Expected: JSON array of idea documents, sorted by signal_strength desc then created_at desc.

- [ ] **Step 5: Type-check + full test suite**

Run: `bunx tsc --noEmit && bun test`
Expected: clean type-check, all tests pass (content-hash, parse-ideas, dedupe-ideas, and the existing sources/telegram tests).

- [ ] **Step 6: Commit**

```bash
git add src/extract-ideas.ts package.json
git commit -m "feat(ideas): extract-ideas driver + npm scripts"
```

---

## Task 7: Extend listener.md with ideas commands

**Files:**
- Modify: `triggers/listener.md`

- [ ] **Step 1: Read the current listener.md**

Read [triggers/listener.md](triggers/listener.md) to find the exact insertion point — specifically the location of the existing "Typical queries and how to handle them" section and the "Rules" section.

- [ ] **Step 2: Add an "Ideas pipeline commands" section**

Insert this section *between* the existing "Typical queries and how to handle them" section and the "Rules" section:

```markdown
## Ideas pipeline commands

Dirk uses these to inspect and manage the ideas queue produced by `bun run extract-ideas`. Use Bash to invoke the helper, parse the JSON, and reply in Telegram-friendly format.

- `/ideas` (or just `ideas`) — Run `bun run ideas list` via Bash. Parse the JSON, then reply with the top 10 by `signal_strength` formatted as:
  ```
  *Ideas Queue*
  • `<slug>` — <title> (sig:<n>, <status>)
    sources: <count> briefs/actions
  ```
  Mention any with `status: queued` at the top of the reply.
- `/idea <slug>` (or `idea <slug>`) — Run `bun run ideas show <slug>`. Reply with: title, slug, signal_strength, status, sources list, success_criteria if non-null, prior_art twist if non-null, learnings if non-empty. Keep the message under 1500 chars; if the idea record is large, summarize the long fields rather than dumping them.
- `/reject <slug> [reason]` (or `reject <slug> [reason]`) — Run `bun run ideas set-status <slug> rejected "<reason>"`. Confirm with `✓ rejected <slug>` plus the reason on the next line. If the slug is unknown the CLI exits non-zero — relay that failure to Dirk.

If a slug looks ambiguous or missing, ask Dirk to clarify rather than guessing. Never invent a slug.
```

- [ ] **Step 3: Verify the file**

Run: `cat triggers/listener.md | grep -c "Ideas pipeline commands"`
Expected: `1`.

- [ ] **Step 4: Commit**

```bash
git add triggers/listener.md
git commit -m "feat(listener): add /ideas, /idea, /reject commands"
```

---

## Task 8: Wire extract-ideas into loop-triggers.sh

**Files:**
- Modify: `scripts/loop-triggers.sh`

**Note:** `extract-ideas` is not an LLM trigger — it's a cheap markdown-parsing script. So we call `bun run extract-ideas` directly inside the loop, not via `run-trigger.sh`. This runs in milliseconds and doesn't burn any subscription quota.

- [ ] **Step 1: Add the extract step inside the daily loop**

In `scripts/loop-triggers.sh`, modify the `while true` block. Change:

```bash
while true; do
  brief_at=$(future_epoch "$BRIEF_HOUR" "$BRIEF_MIN")
  sleep_until "$brief_at" "brief"
  fire "triggers/scheduled-brief.md" "brief"

  action_at=$(future_epoch "$ACTION_HOUR" "$ACTION_MIN")
  sleep_until "$action_at" "action-research"
  fire "triggers/action-research.md" "action-research"

  log "cycle complete, looping"
done
```

to:

```bash
while true; do
  brief_at=$(future_epoch "$BRIEF_HOUR" "$BRIEF_MIN")
  sleep_until "$brief_at" "brief"
  fire "triggers/scheduled-brief.md" "brief"

  action_at=$(future_epoch "$ACTION_HOUR" "$ACTION_MIN")
  sleep_until "$action_at" "action-research"
  fire "triggers/action-research.md" "action-research"

  log "running extract-ideas"
  if bun run extract-ideas; then
    log "extract-ideas ok"
  else
    log "extract-ideas failed (rc=$?) — continuing"
  fi

  log "cycle complete, looping"
done
```

The failure is non-fatal — a parser hiccup shouldn't break the daily loop. The log line surfaces it for inspection.

- [ ] **Step 2: Update the script's header comment**

Change the existing header comment:

```bash
# loop-triggers.sh — daily driver for morning-brief and action-research.
#
# Designed to run inside tmux on a machine that stays on. Fires the
# brief at 06:30 local, then action-research at 07:00 local, then
# sleeps until the next day.
```

to:

```bash
# loop-triggers.sh — daily driver for morning-brief, action-research, and ideas extraction.
#
# Designed to run inside tmux on a machine that stays on. Fires the
# brief at 06:30 local, then action-research at 07:00 local, then runs
# the (cheap, non-LLM) extract-ideas pass, then sleeps until the next day.
```

- [ ] **Step 3: Syntax-check the script**

Run: `bash -n scripts/loop-triggers.sh`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add scripts/loop-triggers.sh
git commit -m "feat(loop): run extract-ideas after action-research"
```

---

## Task 9: Final verification

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: all tests pass. Specifically count:
- 5 in `content-hash.test.ts`
- 7 in `parse-ideas.test.ts`
- 5 in `dedupe-ideas.test.ts`
- existing tests in `sources.test.ts` and `telegram.test.ts` still pass

- [ ] **Step 2: Type-check the whole project**

Run: `bunx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Confirm end-to-end behavior**

Run: `bun run extract-ideas` (idempotent — expect `skipped` count == candidates count by now)
Run: `bun run ideas list`
Run: `bun run ideas show <slug-from-the-list>`
Run: `bun run ideas set-status <slug> rejected "test"` then `bun run ideas list rejected`

All four commands should work end-to-end, with the `rejected` test idea showing up in the last command. Don't forget to revert that test rejection if you don't want it persisted: `bun run ideas set-status <slug> extracted`.

- [ ] **Step 4: Push the branch**

```bash
git push origin HEAD
```

Phase 1a is complete. Let `extract-ideas` accumulate data for ~1 week, then write Phase 1b (synthesize + triage + cluster-ideas + the embedding work).

---

## Done criteria

- All 9 tasks completed and committed.
- `bun test` green.
- `bunx tsc --noEmit` clean.
- `bun run extract-ideas` populates the `ideas` Mongo collection from existing briefs/actions.
- `bun run ideas list` returns ideas sorted by signal_strength.
- `/ideas`, `/idea <slug>`, `/reject <slug>` work through Telegram.
- `scripts/loop-triggers.sh` runs extract-ideas as part of the daily cycle.
