# Factory Substrate + CLIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested TypeScript substrate + CLI surface the factory loop will drive — criterion classification, run/terminator logic, the build-dir guard, the pgid-aware lock, the `factory_runs` collection, and one `factory` CLI the trigger calls from Bash.

**Architecture:** Pure logic modules (classifier, terminators, doc builders) are unit-tested with `bun:test`; I/O modules (lock, runs, init-db) are smoke-tested against `morning-brief-staging`. A single `src/factory.ts` CLI dispatches subcommands (mirroring `src/ideas-state.ts`) so `triggers/factory.md` (Plan 2) interacts entirely through `bun run factory <subcommand>`. No orchestration here — that's Plan 2.

**Tech Stack:** Bun, TypeScript, MongoDB (`mongodb` v7), `@xenova/transformers` (existing `embed`/`cosine` from `src/embeddings.ts`).

**Spec:** `docs/superpowers/specs/2026-05-31-factory-loop-design.md`

**Branch:** create `claude/phase-2-factory-substrate` off `main` before Task 1.

---

### Task 1: Criterion classifier (`src/criteria-classify.ts`)

Pure heuristic that buckets a success-criterion string into `test` / `scriptable` / `human_or_external`. The factory's LLM may override, but this is the deterministic first pass and the thing we unit-test against the real 7 criteria.

**Files:**
- Create: `src/criteria-classify.ts`
- Test: `src/__tests__/criteria-classify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/criteria-classify.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/__tests__/criteria-classify.test.ts`
Expected: FAIL — `Cannot find module "../criteria-classify"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/criteria-classify.ts
/**
 * criteria-classify.ts — bucket a success-criterion string into how it can be
 * verified. Pure, deterministic, heuristic. The factory trigger's LLM may
 * upgrade/downgrade a classification, but this is the first pass and the
 * thing we test against real triage output.
 *
 *  - "test"             → an executable test asserting runtime behavior.
 *  - "scriptable"       → a non-test assertion: file exists, line count,
 *                         exported symbol, manifest schema, artifact shape.
 *  - "human_or_external"→ needs a human action (screencast, signup) or an
 *                         external harness (loads in Claude Code, paid API).
 *
 * Order matters: human_or_external is checked first (most important not to
 * mis-bucket — these become the handoff checklist, never a scope-break),
 * then behavioral "test" signals, then "scriptable", then a scriptable
 * default (most criteria are artifact-ish).
 */
export type CriterionKind = "test" | "scriptable" | "human_or_external";

export interface Classification {
  text: string;
  kind: CriterionKind;
  rationale: string;
}

const HUMAN_OR_EXTERNAL: RegExp[] = [
  /screencast|screen recording|\brecord(ed|ing)?\b|\bvideo\b|\bloom\b/i,
  /demo day|present(ation|s)?\b|\bpitch\b/i,
  /sign[ -]?up|\bsignup\b|create an account|requires? .*account/i,
  /\bmanually\b|by hand|human (review|sign-?off|action)/i,
  /loads? (in|via) .*claude code|claude code skill tool|skill tool in claude/i,
  /external (service|api|infra|harness)|paid api|third-?party service/i,
  /publish(ed)? to|submit(ted)? to|email(ed)? to/i,
];

const TEST: RegExp[] = [
  /\breturns?\b|\basserts?\b|\bequals?\b|evaluates? to/i,
  /same .* across|stable across|idempotent|deterministic|round-?trip/i,
  /given .* when .* then|for (a|an|any) .* input|when called/i,
];

const SCRIPTABLE: RegExp[] = [
  /under \d+ ?lines|<\s*\d+ ?lines|\bline count\b/i,
  /\bdefines?\b|\bexposes?\b|\bexports?\b|\bdeclares?\b/i,
  /\bfile\b|\bstub\b|\bsnippet\b|\bexists?\b/i,
  /\bmanifest\b|\bschema\b|\bsignature\b/i,
  /\.(py|ts|tsx|js|md|json|toml|ya?ml)\b/i,
];

function firstMatch(text: string, res: RegExp[]): RegExp | null {
  for (const re of res) if (re.test(text)) return re;
  return null;
}

export function classifyCriterion(text: string): Classification {
  const he = firstMatch(text, HUMAN_OR_EXTERNAL);
  if (he) return { text, kind: "human_or_external", rationale: `human/external signal: ${he.source}` };

  const t = firstMatch(text, TEST);
  if (t) return { text, kind: "test", rationale: `executable-test signal: ${t.source}` };

  const s = firstMatch(text, SCRIPTABLE);
  if (s) return { text, kind: "scriptable", rationale: `scriptable-assertion signal: ${s.source}` };

  return { text, kind: "scriptable", rationale: "no strong signal; defaulting to scriptable artifact check" };
}

export function classifyAll(criteria: string[]): Classification[] {
  return criteria.map(classifyCriterion);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/__tests__/criteria-classify.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/criteria-classify.ts src/__tests__/criteria-classify.test.ts
git commit -m "feat(factory): pure criterion classifier (test/scriptable/human_or_external)"
```

---

### Task 2: Terminator logic (`src/factory-terminators.ts`)

Pure cap + stuck detection. The cosine parts take **precomputed** unit vectors so the module stays pure and testable; the factory trigger embeds hypotheses via the existing `embed()` and passes vectors in.

**Files:**
- Create: `src/factory-terminators.ts`
- Test: `src/__tests__/factory-terminators.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/factory-terminators.test.ts
import { test, expect } from "bun:test";
import {
  isCapped,
  failingStagnant,
  maxPairwiseCosine,
  decideStuck,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_MAX_MS,
} from "../factory-terminators";

function v(...nums: number[]): Float32Array {
  const a = new Float32Array(nums);
  let n = 0;
  for (const x of a) n += x * x;
  const len = Math.sqrt(n);
  if (len === 0) return a;
  for (let i = 0; i < a.length; i++) a[i] /= len;
  return a;
}

test("isCapped: false under both limits, true over either", () => {
  expect(isCapped(5, 60_000)).toBe(false);
  expect(isCapped(DEFAULT_MAX_ROUNDS + 1, 0)).toBe(true);
  expect(isCapped(1, DEFAULT_MAX_MS + 1)).toBe(true);
});

test("isCapped: respects custom opts", () => {
  expect(isCapped(3, 0, { maxRounds: 2 })).toBe(true);
  expect(isCapped(0, 100, { maxMs: 50 })).toBe(true);
});

test("failingStagnant: true when no decrease across the window", () => {
  expect(failingStagnant([3, 3, 3, 3, 3])).toBe(true);   // flat
  expect(failingStagnant([3, 4, 5, 6, 7])).toBe(true);   // worsening counts as no-progress
});

test("failingStagnant: false when a decrease (progress) occurs in the window", () => {
  expect(failingStagnant([3, 3, 2, 3, 3])).toBe(false);
  expect(failingStagnant([5, 4, 3, 2, 1])).toBe(false);
});

test("failingStagnant: false when fewer than window rounds", () => {
  expect(failingStagnant([3, 3, 3])).toBe(false);
});

test("maxPairwiseCosine: ~1 for near-identical vectors, low for orthogonal", () => {
  expect(maxPairwiseCosine([v(1, 0, 0), v(1, 0, 0)])).toBeCloseTo(1, 5);
  expect(maxPairwiseCosine([v(1, 0, 0), v(0, 1, 0)])).toBeCloseTo(0, 5);
});

test("decideStuck: true when failing is stagnant AND hypotheses are near-duplicates", () => {
  const failing = [3, 3, 3, 3, 3];
  const vecs = [v(1, 0, 0), v(1, 0, 0), v(0.99, 0.14, 0), v(1, 0, 0), v(0.98, 0.2, 0)];
  expect(decideStuck(failing, vecs)).toBe(true);
});

test("decideStuck: false when hypotheses are diverse even if failing is stagnant", () => {
  const failing = [3, 3, 3, 3, 3];
  const vecs = [v(1, 0, 0), v(0, 1, 0), v(0, 0, 1), v(1, 1, 0), v(0, 1, 1)];
  expect(decideStuck(failing, vecs)).toBe(false);
});

test("decideStuck: false when progress is being made regardless of hypotheses", () => {
  const failing = [5, 4, 3, 2, 1];
  const vecs = [v(1, 0, 0), v(1, 0, 0), v(1, 0, 0), v(1, 0, 0), v(1, 0, 0)];
  expect(decideStuck(failing, vecs)).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/__tests__/factory-terminators.test.ts`
Expected: FAIL — `Cannot find module "../factory-terminators"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/factory-terminators.ts
/**
 * factory-terminators.ts — pure cap + stuck detection for the factory loop.
 *
 * Cosine-based stuck detection takes PRECOMPUTED unit vectors so this module
 * has no I/O and is fully unit-testable. The trigger embeds hypothesis text
 * via src/embeddings.ts `embed()` and passes the vectors here.
 */
import { cosine } from "./embeddings";

export const DEFAULT_MAX_ROUNDS = 20;
export const DEFAULT_MAX_MS = 30 * 60 * 1000; // 30 minutes

export interface CapOpts {
  maxRounds?: number;
  maxMs?: number;
}

export function isCapped(round: number, elapsedMs: number, opts: CapOpts = {}): boolean {
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  return round > maxRounds || elapsedMs > maxMs;
}

/**
 * True when the last `window` failing-test counts show no decrease — i.e. no
 * progress. A single decrease anywhere in the window resets the verdict to
 * false (progress was made). Fewer than `window` rounds is never stagnant.
 */
export function failingStagnant(failingCounts: number[], window = 5): boolean {
  if (failingCounts.length < window) return false;
  const recent = failingCounts.slice(-window);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] < recent[i - 1]) return false;
  }
  return true;
}

export function maxPairwiseCosine(vectors: Float32Array[]): number {
  let max = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const s = cosine(vectors[i], vectors[j]);
      if (s > max) max = s;
    }
  }
  return max;
}

export interface StuckOpts {
  window?: number;
  cosineThreshold?: number;
}

/**
 * Stuck = `window` rounds of non-decreasing failing counts AND the recent
 * hypotheses are near-duplicates (max pairwise cosine > threshold).
 */
export function decideStuck(
  failingCounts: number[],
  hypothesisVectors: Float32Array[],
  opts: StuckOpts = {},
): boolean {
  const window = opts.window ?? 5;
  const threshold = opts.cosineThreshold ?? 0.9;
  if (!failingStagnant(failingCounts, window)) return false;
  const recentVecs = hypothesisVectors.slice(-window);
  if (recentVecs.length < 2) return false;
  return maxPairwiseCosine(recentVecs) > threshold;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/__tests__/factory-terminators.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/factory-terminators.ts src/__tests__/factory-terminators.test.ts
git commit -m "feat(factory): pure cap + stuck terminator logic"
```

---

### Task 3: Build-dir guard (`src/factory-guard.ts`)

The separate-repo model builds in `.claude/builds/<slug>` (a clone of the new private repo), not a morning-brief worktree. Add a build-dir boundary assertion alongside the existing worktree functions (kept for backward-compat).

**Files:**
- Modify: `src/factory-guard.ts`
- Test: `src/__tests__/factory-guard.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to the existing file)**

```ts
// append to src/__tests__/factory-guard.test.ts
import {
  expectedBuildDir,
  assertInBuildDir,
  WrongBuildDirError,
} from "../factory-guard";

test("expectedBuildDir: composes repoRoot/.claude/builds/<slug>", () => {
  expect(expectedBuildDir("uipe-skill", "/repo")).toBe("/repo/.claude/builds/uipe-skill");
});

test("assertInBuildDir: silent when cwd matches", () => {
  expect(() =>
    assertInBuildDir("uipe-skill", "/repo", "/repo/.claude/builds/uipe-skill"),
  ).not.toThrow();
});

test("assertInBuildDir: throws WrongBuildDirError when cwd is the repo root", () => {
  expect(() => assertInBuildDir("uipe-skill", "/repo", "/repo")).toThrow(WrongBuildDirError);
});

test("assertInBuildDir: throws when cwd is a different idea's build dir", () => {
  expect(() =>
    assertInBuildDir("uipe-skill", "/repo", "/repo/.claude/builds/other"),
  ).toThrow(WrongBuildDirError);
});

test("WrongBuildDirError carries expected and actual paths", () => {
  try {
    assertInBuildDir("uipe-skill", "/repo", "/somewhere/else");
    throw new Error("should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(WrongBuildDirError);
    expect((e as WrongBuildDirError).expected).toBe("/repo/.claude/builds/uipe-skill");
    expect((e as WrongBuildDirError).actual).toBe("/somewhere/else");
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/__tests__/factory-guard.test.ts`
Expected: FAIL — `expectedBuildDir` / `assertInBuildDir` / `WrongBuildDirError` not exported.

- [ ] **Step 3: Add the implementation (append to `src/factory-guard.ts`)**

```ts
// append to src/factory-guard.ts (stripTrailingSlash + join already in file)

export class WrongBuildDirError extends Error {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
    public readonly ideaSlug: string,
  ) {
    super(`Factory must run in ${expected} for idea "${ideaSlug}", but cwd is ${actual}.`);
    this.name = "WrongBuildDirError";
  }
}

export function expectedBuildDir(ideaSlug: string, repoRoot: string): string {
  return join(repoRoot, ".claude", "builds", ideaSlug);
}

export function assertInBuildDir(
  ideaSlug: string,
  repoRoot: string,
  cwd: string = process.cwd(),
): void {
  const expected = stripTrailingSlash(expectedBuildDir(ideaSlug, repoRoot));
  const actual = stripTrailingSlash(cwd);
  if (actual !== expected) {
    throw new WrongBuildDirError(expected, actual, ideaSlug);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/__tests__/factory-guard.test.ts`
Expected: PASS (existing worktree tests + 5 new build-dir tests).

- [ ] **Step 5: Commit**

```bash
git add src/factory-guard.ts src/__tests__/factory-guard.test.ts
git commit -m "feat(factory): add build-dir boundary guard for separate-repo builds"
```

---

### Task 4: pgid on the lock (`src/factory-lock.ts`)

`/abort` kills the whole process group, so the lock must store `pgid` next to `pid`.

**Files:**
- Modify: `src/factory-lock.ts`
- Test: `src/__tests__/factory-lock.test.ts` (the existing smoke; add a pgid assertion)

- [ ] **Step 1: Add `pgid` to `LockState` and the insert/CAS/read paths**

In `src/factory-lock.ts`:

Add to `LockState`:
```ts
export interface LockState {
  idea_slug: string;
  started_at: Date;
  pid: number;
  pgid: number;
}
```

Change the `acquireLock` signature to accept `pgid` (default = pid):
```ts
export async function acquireLock(
  db: Db,
  ideaSlug: string,
  ttlMs: number,
  pid: number = process.pid,
  pgid: number = pid,
): Promise<LockResult> {
```

In the phase-1 insert, add `pgid`:
```ts
    await db.collection("factory_lock").insertOne({
      _id: SINGLETON_ID as any,
      idea_slug: ideaSlug,
      started_at: now,
      ttl_ms: ttlMs,
      pid,
      pgid,
    });
```

In the phase-2 CAS `$set`, add `pgid`:
```ts
      $set: {
        idea_slug: ideaSlug,
        started_at: now,
        ttl_ms: ttlMs,
        pid,
        pgid,
      },
```

In the `prior` construction and in `checkLock`, include `pgid: existing.pgid` / `pgid: doc.pgid` so `LockState` is complete.

- [ ] **Step 2: Update the smoke test to assert pgid round-trips**

In `src/__tests__/factory-lock.test.ts`, in the existing "free → acquired" smoke (the skip-gated one), pass a pgid and assert `checkLock` returns it:
```ts
  const res = await acquireLock(db, "demo-slug", 60_000, 4242, 4243);
  expect(res.acquired).toBe(true);
  const state = await checkLock(db);
  expect(state?.pid).toBe(4242);
  expect(state?.pgid).toBe(4243);
```

- [ ] **Step 3: Verify types + run the (skip-gated) smoke**

Run: `bunx tsc --noEmit` — Expected: clean.
Run: `bun test src/__tests__/factory-lock.test.ts` — Expected: tests pass or skip (skip without `MONGODB_URI`). If `.env` present, the pgid assertion passes against staging.

- [ ] **Step 4: Commit**

```bash
git add src/factory-lock.ts src/__tests__/factory-lock.test.ts
git commit -m "feat(factory): store pgid on the lock for clean process-group abort"
```

---

### Task 5: `factory_runs` builders + I/O (`src/factory-runs.ts`)

Pure doc builders (tested) plus thin Mongo wrappers (smoke). `human_handoff` is derived from the classification so the done-partial path always has the checklist.

**Files:**
- Create: `src/factory-runs.ts`
- Test: `src/__tests__/factory-runs.test.ts`

- [ ] **Step 1: Write the failing test (pure builders)**

```ts
// src/__tests__/factory-runs.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/__tests__/factory-runs.test.ts`
Expected: FAIL — `Cannot find module "../factory-runs"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/factory-runs.ts
/**
 * factory-runs.ts — the factory_runs collection: one document per build.
 * Pure builders (buildRunDoc, buildRoundEntry) + thin Mongo wrappers.
 */
import { ObjectId, type Db } from "mongodb";
import type { Classification } from "./criteria-classify";

export type Terminator = "done" | "stuck" | "scope-break" | "capped" | "aborted";

export interface RoundEntry {
  n: number;
  failing_test_count: number;
  hypothesis: string;
  test_output_excerpt: string;
}

export interface RunDoc {
  idea_slug: string;
  started_at: Date;
  ended_at: Date | null;
  terminator: Terminator | null;
  rounds: number;
  branch: string;
  repo_url: string | null;
  build_dir: string;
  criteria_classification: Classification[];
  human_handoff: string[];
  rounds_log: RoundEntry[];
  cost_usd: number | null;
  tokens: number | null;
  duration_s: number | null;
}

export interface BuildRunArgs {
  idea_slug: string;
  build_dir: string;
  branch: string;
  criteria_classification: Classification[];
}

const EXCERPT_MAX = 2000;

export function buildRunDoc(args: BuildRunArgs, now: Date = new Date()): RunDoc {
  return {
    idea_slug: args.idea_slug,
    started_at: now,
    ended_at: null,
    terminator: null,
    rounds: 0,
    branch: args.branch,
    repo_url: null,
    build_dir: args.build_dir,
    criteria_classification: args.criteria_classification,
    human_handoff: args.criteria_classification
      .filter((c) => c.kind === "human_or_external")
      .map((c) => c.text),
    rounds_log: [],
    cost_usd: null,
    tokens: null,
    duration_s: null,
  };
}

export function buildRoundEntry(
  n: number,
  failing_test_count: number,
  hypothesis: string,
  test_output_excerpt: string,
): RoundEntry {
  return {
    n,
    failing_test_count,
    hypothesis,
    test_output_excerpt: test_output_excerpt.slice(0, EXCERPT_MAX),
  };
}

export interface FinalizeFields {
  terminator: Terminator;
  ended_at: Date;
  repo_url?: string | null;
  cost_usd?: number | null;
  tokens?: number | null;
  duration_s?: number | null;
}

export async function createRun(db: Db, doc: RunDoc): Promise<string> {
  const r = await db.collection("factory_runs").insertOne(doc as any);
  return r.insertedId.toString();
}

export async function appendRound(db: Db, runId: string, entry: RoundEntry): Promise<void> {
  await db.collection("factory_runs").updateOne(
    { _id: new ObjectId(runId) },
    { $push: { rounds_log: entry as any }, $set: { rounds: entry.n } },
  );
}

export async function finalizeRun(db: Db, runId: string, fields: FinalizeFields): Promise<void> {
  await db.collection("factory_runs").updateOne(
    { _id: new ObjectId(runId) },
    { $set: fields as any },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/__tests__/factory-runs.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/factory-runs.ts src/__tests__/factory-runs.test.ts
git commit -m "feat(factory): factory_runs doc builders + Mongo wrappers"
```

---

### Task 6: `factory_runs` collection in init-db (`scripts/init-db.ts`)

**Files:**
- Modify: `scripts/init-db.ts`

- [ ] **Step 1: Add the collection to the ensure-list**

Find the collections array (currently ends with `"factory_lock"`) and add `"factory_runs"`:
```ts
  const collections = ["seen_items", "signals", "preferences", "ideas", "audit_log", "system_state", "factory_lock", "factory_runs"];
```

- [ ] **Step 2: Add indexes after the existing `ideas` index block**

```ts
  await db.collection("factory_runs").createIndex({ idea_slug: 1 });
  await db.collection("factory_runs").createIndex({ started_at: -1 });
```

- [ ] **Step 3: Run init-db (idempotent) and verify**

Run: `bun run init-db`
Expected: completes without error; re-running is a no-op (idempotent).

Verify the collection + indexes (requires `.env`):
```bash
set -a; . ./.env; set +a
mongosh "$MONGODB_URI" --quiet --eval "const c=db.getSiblingDB('$MONGODB_DB'); print(c.getCollectionNames().includes('factory_runs')); printjson(c.factory_runs.getIndexes().map(i=>i.name))"
```
Expected: `true` and an index list including `idea_slug_1` and `started_at_-1`.

- [ ] **Step 4: Commit**

```bash
git add scripts/init-db.ts
git commit -m "feat(db): factory_runs collection + indexes"
```

---

### Task 7: `factory` CLI dispatcher (`src/factory.ts`)

The Bash surface the trigger (Plan 2) calls. Mirrors `src/ideas-state.ts`: `process.argv[2]` is the subcommand, flags parsed from the rest. Mongo-touching subcommands open a `MongoClient`; compute-only ones (`classify`, `cap-check`, `stuck-check`) don't.

**Files:**
- Create: `src/factory.ts`
- Modify: `package.json` (add the `factory` script)

- [ ] **Step 1: Write the CLI**

```ts
// src/factory.ts
/**
 * factory.ts — CLI surface for triggers/factory.md (Plan 2). One subcommand
 * per argv[2]. Compute-only subcommands (classify, cap-check, stuck-check)
 * need no DB; lock/run subcommands open a MongoClient.
 *
 * Subcommands:
 *   classify     --json '<criteria string array>'        -> Classification[]
 *   cap-check    --round N --elapsed-ms M                 -> "capped" | "ok"
 *   stuck-check  --failing-json '[...]' --hypotheses-json '[...]'  -> "stuck" | "ok"
 *   lock-acquire --slug S --ttl-ms M --pid P --pgid G     -> LockResult
 *   lock-release --slug S
 *   lock-check                                            -> LockState | "null"
 *   run-create   --slug S --build-dir D --branch B --classification-json '[...]' -> runId
 *   run-append   --id ID --n N --failing F --hypothesis H --excerpt E
 *   run-finalize --id ID --terminator T [--repo-url U --cost-usd C --tokens K --duration-s D]
 */
import { MongoClient } from "mongodb";
import { classifyAll } from "./criteria-classify";
import { isCapped, decideStuck } from "./factory-terminators";
import { embed } from "./embeddings";
import { acquireLock, releaseLock, checkLock } from "./factory-lock";
import {
  buildRunDoc,
  buildRoundEntry,
  createRun,
  appendRound,
  finalizeRun,
  type Terminator,
} from "./factory-runs";

function parseFlagArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}

async function main() {
  const sub = process.argv[2];
  const args = parseFlagArgs(process.argv.slice(3));

  // ---- compute-only subcommands (no DB) ----
  if (sub === "classify") {
    const criteria: string[] = JSON.parse(args["json"] ?? "[]");
    console.log(JSON.stringify(classifyAll(criteria)));
    return;
  }
  if (sub === "cap-check") {
    const capped = isCapped(Number(args["round"]), Number(args["elapsed-ms"]));
    console.log(capped ? "capped" : "ok");
    return;
  }
  if (sub === "stuck-check") {
    const failing: number[] = JSON.parse(args["failing-json"] ?? "[]");
    const hyps: string[] = JSON.parse(args["hypotheses-json"] ?? "[]");
    const vecs = await Promise.all(hyps.map((h) => embed(h)));
    console.log(decideStuck(failing, vecs) ? "stuck" : "ok");
    return;
  }

  // ---- DB subcommands ----
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("factory: MONGODB_URI is not set");
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);

    switch (sub) {
      case "lock-acquire": {
        const res = await acquireLock(
          db,
          args["slug"],
          Number(args["ttl-ms"]),
          Number(args["pid"]),
          Number(args["pgid"]),
        );
        console.log(JSON.stringify(res));
        break;
      }
      case "lock-release":
        await releaseLock(db, args["slug"]);
        console.log("released");
        break;
      case "lock-check": {
        const state = await checkLock(db);
        console.log(state ? JSON.stringify(state) : "null");
        break;
      }
      case "run-create": {
        const doc = buildRunDoc({
          idea_slug: args["slug"],
          build_dir: args["build-dir"],
          branch: args["branch"],
          criteria_classification: JSON.parse(args["classification-json"] ?? "[]"),
        });
        console.log(await createRun(db, doc));
        break;
      }
      case "run-append":
        await appendRound(
          db,
          args["id"],
          buildRoundEntry(Number(args["n"]), Number(args["failing"]), args["hypothesis"], args["excerpt"] ?? ""),
        );
        console.log("appended");
        break;
      case "run-finalize":
        await finalizeRun(db, args["id"], {
          terminator: args["terminator"] as Terminator,
          ended_at: new Date(),
          repo_url: args["repo-url"] ?? null,
          cost_usd: args["cost-usd"] ? Number(args["cost-usd"]) : null,
          tokens: args["tokens"] ? Number(args["tokens"]) : null,
          duration_s: args["duration-s"] ? Number(args["duration-s"]) : null,
        });
        console.log("finalized");
        break;
      default:
        console.error(`factory: unknown subcommand "${sub}"`);
        process.exit(2);
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the package.json script**

In `package.json` `scripts`, after the `"system-state"` line, add:
```json
    "factory": "bun run src/factory.ts",
```

- [ ] **Step 3: Verify compute-only subcommands (no DB needed)**

Run:
```bash
bun run factory classify --json '["SKILL.md under 300 lines","record two screencasts","foo() returns 4"]'
```
Expected: JSON array with kinds `["scriptable","human_or_external","test"]`.

Run:
```bash
bun run factory cap-check --round 21 --elapsed-ms 0
```
Expected: `capped`.

- [ ] **Step 4: Verify types**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/factory.ts package.json
git commit -m "feat(factory): factory CLI dispatcher (classify/lock/run/terminators)"
```

---

### Task 8: Full verification + PR

**Files:** none (verification)

- [ ] **Step 1: Run the whole suite + typecheck**

Run: `bun test && bunx tsc --noEmit`
Expected: all tests pass (new: criteria-classify 5, factory-terminators 9, factory-guard +5, factory-runs 2; lock smoke pass/skip), tsc clean.

- [ ] **Step 2: Smoke the DB CLIs against staging (requires `.env`)**

```bash
bun run factory lock-check                 # expect "null" when no build running
bun run init-db                            # idempotent; ensures factory_runs exists
```
Expected: `lock-check` prints `null`; `init-db` completes clean.

- [ ] **Step 3: Push + open PR**

```bash
git push origin claude/phase-2-factory-substrate
gh pr create --base main --head claude/phase-2-factory-substrate \
  --title "feat(factory): Phase 2 substrate — classifier, terminators, runs, guard, lock pgid, CLI" \
  --body-file <(printf '%s\n' "## Summary" "" "Phase 2 factory substrate per docs/superpowers/specs/2026-05-31-factory-loop-design.md. Pure logic + data layer + the \`factory\` CLI the build loop (Plan 2) will drive. No orchestration yet." "" "## Contents" "- \`src/criteria-classify.ts\` — test/scriptable/human_or_external classifier (tested vs the 7 real criteria)" "- \`src/factory-terminators.ts\` — cap + stuck detection (pure, precomputed-vector cosine)" "- \`src/factory-guard.ts\` — build-dir boundary guard" "- \`src/factory-lock.ts\` — pgid for clean process-group abort" "- \`src/factory-runs.ts\` — factory_runs builders + Mongo wrappers" "- \`scripts/init-db.ts\` — factory_runs collection + indexes" "- \`src/factory.ts\` — CLI dispatcher" "" "## Test plan" "- [x] \`bun test\` green" "- [x] \`bunx tsc --noEmit\` clean" "- [x] CLI smoke: classify / cap-check / lock-check" "- [ ] Plan 2 wires this into triggers/factory.md + listener")
```

- [ ] **Step 4: Confirm PR opened**

Run: `gh pr list --head claude/phase-2-factory-substrate --json number,url,state`
Expected: one OPEN PR.

---

## Self-review

**Spec coverage:** classifier (Task 1) → spec "classify each criterion"; terminators (Task 2) → caps + stuck; build-dir guard (Task 3) → separate-repo model; lock pgid (Task 4) → clean abort; factory_runs (Tasks 5–6) → data model incl. `criteria_classification`, `human_handoff`, `cost_usd`/`tokens`/`duration_s`, terminator enum; CLI (Task 7) → the Bash surface. Deferred to Plan 2 (orchestration): `triggers/factory.md`, `scripts/start-factory.sh`, listener `/build` `/abort` `/factory-status`, end-to-end dry-run.

**Placeholder scan:** every code step has complete code; no TBD/TODO.

**Type consistency:** `Classification`/`CriterionKind` (Task 1) consumed unchanged in `factory-runs.ts` (Task 5) and `factory.ts` (Task 7); `Terminator` defined in Task 5 and imported in Task 7; `RunDoc.build_dir` matches the guard's `.claude/builds/<slug>`; `acquireLock(db, slug, ttlMs, pid, pgid)` signature consistent between Task 4 and the CLI call in Task 7.
