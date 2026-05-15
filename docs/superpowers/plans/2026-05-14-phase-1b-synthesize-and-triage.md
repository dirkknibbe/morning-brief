# Phase 1b — Synthesize + Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the synthesize and triage stages of the ideas pipeline. After this plan lands, the daily loop extracts ideas (existing), proposes cross-idea syntheses (new), scores survivors with a prior-art web scan (new), and queues the top candidate for the Telegram digest — with explicit `success_criteria` ready for the factory to consume later.

**Architecture:** Two new trigger markdown files (LLM-driven via RemoteTrigger) backed by three new code modules. Embeddings are local (`@xenova/transformers`, no API calls). Clustering is pure: compute pairwise cosine on the active idea pool, return clusters of 2-4 ideas whose pairwise similarities all fall in the **0.55-0.80 mid-band** — below is "unrelated," above is "near-duplicate already merged by reinforce." The trigger agents call CLI subcommands on `bun run ideas` to (a) fetch candidate clusters, (b) insert synthesis ideas, (c) record triage scores/criteria/prior_art. Loop integration adds two `system-state check <stage>` gates and two trigger invocations to `scripts/loop-triggers.sh`.

**Tech Stack:** Bun + TypeScript + MongoDB. New dep: `@xenova/transformers` (local ONNX-backed sentence embeddings, model: `Xenova/all-MiniLM-L6-v2`, ~25MB lazy-downloaded on first use, 384-dim vectors).

**Working directory:** `/Users/dirkknibbe/morning-brief/.claude/worktrees/busy-chandrasekhar-b7e90a`

**Pre-requisite:** This plan assumes the quick-wins plan (`2026-05-14-quick-wins-validator-and-index.md`) has landed. In particular, the validator is in **strict** mode — every synthesis idea this plan inserts must satisfy the `kind=synthesis` invariants (`parents.length >= 2`, `synthesis_thesis` non-empty, `synthesis_depth` in `[1, 2]`). If the validator is still in warn mode, Tasks 5-7 will silently mask bugs.

**Environment:** As before — `MONGODB_URI` lives in `/Users/dirkknibbe/morning-brief/.env`. Symlink for live commands: `ln -s /Users/dirkknibbe/morning-brief/.env .env`, then `rm .env`. Never `cat`. `MONGODB_DB=morning-brief-staging`.

---

## File structure (locked in before tasks)

**New files:**
- `src/embeddings.ts` — lazy-loaded embed(text) → number[384]. Sole owner of `@xenova/transformers`.
- `src/cluster-ideas.ts` — pure cosine + mid-band clusterer. No I/O. Depends on Float32Array vectors only.
- `src/__tests__/cluster-ideas.test.ts` — unit tests for cosine and clustering.
- `src/__tests__/embeddings.test.ts` — smoke test (lazy + deterministic similarity sanity).
- `triggers/synthesize.md` — daily ~07:25 trigger.
- `triggers/triage.md` — daily ~07:30 trigger.

**Modified files:**
- `src/ideas-state.ts` — add three new CLI subcommands: `cluster-candidates`, `insert-synthesis`, `set-triage`. Each backed by an exported function for unit testing.
- `src/__tests__/ideas-state.test.ts` — new file (no existing test for ideas-state) OR add to existing `__tests__/dedupe-ideas.test.ts` if scope-appropriate. Plan creates a new file.
- `scripts/loop-triggers.sh` — add gated synthesize and triage invocations after extract-ideas.
- `package.json` — add `@xenova/transformers` to dependencies.

**Unchanged but referenced:**
- `triggers/listener.md` — `/ideas` and `/idea <slug>` already handle the new fields (`prior_art`, `success_criteria`, `scores`) per their "if non-null" rule. No edits needed.
- `scripts/init-db.ts` — validator invariants already cover synthesis docs.

---

## Part A — Embeddings infrastructure

### Task 1: Install and wrap `@xenova/transformers`

**Files:**
- Modify: `package.json` (dependencies)
- Create: `src/embeddings.ts`

- [ ] **Step 1: Install the package**

```bash
bun add @xenova/transformers
```

Expected: `package.json` gains `"@xenova/transformers": "^2.x.x"` (latest 2.x — current as of 2026 is the 2.17+ line; if Bun resolves 3.x or `@huggingface/transformers`, update imports accordingly).

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/embeddings.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { embed, cosine } from "../embeddings";

test("embed returns a 384-dim vector for short text", async () => {
  const v = await embed("hello world");
  expect(v).toBeInstanceOf(Float32Array);
  expect(v.length).toBe(384);
});

test("semantically similar text has higher cosine than dissimilar text", async () => {
  const dog = await embed("a small brown dog runs in the park");
  const puppy = await embed("a tiny puppy plays on the grass");
  const banking = await embed("interest rates dropped on Tuesday");
  const simNear = cosine(dog, puppy);
  const simFar = cosine(dog, banking);
  expect(simNear).toBeGreaterThan(simFar);
  expect(simNear).toBeGreaterThan(0.4); // loose floor — model-dependent
});
```

Run: `bun test src/__tests__/embeddings.test.ts`
Expected: FAIL with `Cannot find module '../embeddings'` (or similar).

- [ ] **Step 3: Implement the embeddings wrapper**

Create `src/embeddings.ts`:

```typescript
/**
 * embeddings.ts — local sentence embeddings via @xenova/transformers.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (384 dims, ~25MB, ONNX-backed).
 * Lazy-loaded on first call; subsequent calls reuse the same pipeline.
 *
 * No API calls. The model file is cached under
 * ~/.cache/transformers/Xenova/all-MiniLM-L6-v2/ on first download.
 */

import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

let _pipe: FeatureExtractionPipeline | null = null;

async function getPipe(): Promise<FeatureExtractionPipeline> {
  if (_pipe) return _pipe;
  _pipe = (await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
  )) as FeatureExtractionPipeline;
  return _pipe;
}

export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getPipe();
  const out = await pipe(text, { pooling: "mean", normalize: true });
  // out.data is the flattened tensor; for a single string with mean pooling
  // it has shape [1, 384] flattened to length 384.
  return out.data as Float32Array;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: length mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
```

- [ ] **Step 4: Run the test**

Run: `bun test src/__tests__/embeddings.test.ts`
Expected: PASS. First run is slow (~30-60s — model download). Subsequent runs are <2s.

If FAIL with `Cannot find module '@xenova/transformers'`: re-run `bun add @xenova/transformers`.
If FAIL with model-loading error: check internet connectivity, retry. The model is hosted at huggingface.co.
If FAIL on the dim assertion: the model returned a different size. Check `out.dims` and update the test floor.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: clean. The `@xenova/transformers` package ships its own types; if TypeScript complains about a missing type, add `import type` for whatever's needed.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lockb src/embeddings.ts src/__tests__/embeddings.test.ts
git commit -m "feat(embeddings): local sentence embeddings via @xenova/transformers"
```

---

## Part B — Mid-band clustering

### Task 2: Pure clustering function

**Why:** Synthesize needs candidate clusters of 2-4 ideas with all pairwise cosines in `[0.55, 0.80]`. Below 0.55 = unrelated; above 0.80 = near-dupes (reinforce already handles). The mid-band is where productive combinations live (same domain, different angles).

**Files:**
- Create: `src/cluster-ideas.ts`
- Create: `src/__tests__/cluster-ideas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/cluster-ideas.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { findMidBandClusters } from "../cluster-ideas";

// Helper to build a unit-length Float32Array.
function v(...nums: number[]): Float32Array {
  const a = new Float32Array(nums);
  let n = 0;
  for (const x of a) n += x * x;
  const len = Math.sqrt(n);
  if (len === 0) return a;
  for (let i = 0; i < a.length; i++) a[i] /= len;
  return a;
}

test("returns empty when fewer than 2 items", () => {
  const out = findMidBandClusters([{ id: "a", embedding: v(1, 0, 0) }]);
  expect(out).toEqual([]);
});

test("finds a 2-item cluster when their cosine is in [0.55, 0.80]", () => {
  // ~0.7 cosine — well inside the mid-band.
  const a = v(1, 0, 0);
  const b = v(0.7, 0.714, 0);
  const items = [
    { id: "alpha", embedding: a },
    { id: "beta", embedding: b },
  ];
  const out = findMidBandClusters(items);
  expect(out).toHaveLength(1);
  expect(out[0].sort()).toEqual(["alpha", "beta"]);
});

test("excludes pairs above 0.80 (near-duplicates)", () => {
  // ~0.95 cosine — too similar, should not cluster.
  const a = v(1, 0, 0);
  const b = v(0.95, 0.31, 0);
  const out = findMidBandClusters([
    { id: "a", embedding: a },
    { id: "b", embedding: b },
  ]);
  expect(out).toEqual([]);
});

test("excludes pairs below 0.55 (unrelated)", () => {
  // ~0.3 cosine — too unrelated.
  const a = v(1, 0, 0);
  const b = v(0.3, 0.954, 0);
  const out = findMidBandClusters([
    { id: "a", embedding: a },
    { id: "b", embedding: b },
  ]);
  expect(out).toEqual([]);
});

test("grows a 2-cluster to 3 if the third item is in-band with BOTH existing members", () => {
  // Three vectors mutually ~0.65 cosine.
  const a = v(1, 0, 0);
  const b = v(0.65, 0.76, 0);
  const c = v(0.65, 0.38, 0.66);
  const out = findMidBandClusters([
    { id: "a", embedding: a },
    { id: "b", embedding: b },
    { id: "c", embedding: c },
  ]);
  expect(out).toHaveLength(1);
  expect(out[0].sort()).toEqual(["a", "b", "c"]);
});

test("caps cluster size at 4", () => {
  // Build 5 mutually in-band vectors by perturbing a base vector.
  // We construct them analytically: each is a unit vector at the same
  // angle (~50°) from the next. Tight ring → all pairwise cosines ~0.64.
  const items = Array.from({ length: 5 }, (_, i) => {
    const theta = (i * Math.PI) / 4; // 45° apart
    return { id: `n${i}`, embedding: v(Math.cos(theta), Math.sin(theta), 0) };
  });
  const out = findMidBandClusters(items);
  // Every returned cluster must be size 2-4.
  for (const c of out) {
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c.length).toBeLessThanOrEqual(4);
  }
});

test("caps total returned clusters at 10", () => {
  // 25 random-ish items that all pairwise land in the mid-band by
  // construction: tiny rotations on a unit circle.
  const items = Array.from({ length: 25 }, (_, i) => {
    const t = (i * Math.PI) / 15;
    return { id: `i${i}`, embedding: v(Math.cos(t), Math.sin(t), 0) };
  });
  const out = findMidBandClusters(items);
  expect(out.length).toBeLessThanOrEqual(10);
});
```

Run: `bun test src/__tests__/cluster-ideas.test.ts`
Expected: FAIL with `Cannot find module '../cluster-ideas'`.

- [ ] **Step 2: Implement the clusterer**

Create `src/cluster-ideas.ts`:

```typescript
/**
 * cluster-ideas.ts — pure clustering for the synthesize stage.
 *
 * Returns clusters of 2-4 IDs where every pairwise cosine similarity
 * falls in the mid-band [LOW, HIGH]. Below LOW = unrelated; above HIGH =
 * near-duplicates (reinforce/merge already handles those).
 */

import { cosine } from "./embeddings";

export interface ClusterItem {
  id: string;
  embedding: Float32Array;
}

export const MID_BAND_LOW = 0.55;
export const MID_BAND_HIGH = 0.80;
export const MAX_CLUSTER_SIZE = 4;
export const MAX_CLUSTERS = 10;

/**
 * Returns up to MAX_CLUSTERS clusters of 2-4 item IDs each. A pair is
 * eligible if its cosine ∈ [MID_BAND_LOW, MID_BAND_HIGH]. A cluster is
 * the connected component formed by repeatedly extending an in-band
 * pair with a third/fourth member that is in-band with EVERY existing
 * member (transitive in-band, not just one).
 *
 * Greedy: starts with the highest-cosine in-band pair, extends until
 * no further member is in-band with all current members or size hits
 * MAX_CLUSTER_SIZE, removes those items from the pool, repeats.
 */
export function findMidBandClusters(
  items: readonly ClusterItem[],
  opts?: {
    low?: number;
    high?: number;
    maxClusterSize?: number;
    maxClusters?: number;
  },
): string[][] {
  const low = opts?.low ?? MID_BAND_LOW;
  const high = opts?.high ?? MID_BAND_HIGH;
  const maxSize = opts?.maxClusterSize ?? MAX_CLUSTER_SIZE;
  const maxClusters = opts?.maxClusters ?? MAX_CLUSTERS;

  if (items.length < 2) return [];

  // Pre-compute pairwise similarities; index by item id.
  const sims = new Map<string, Map<string, number>>();
  for (const it of items) sims.set(it.id, new Map());
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = cosine(items[i].embedding, items[j].embedding);
      sims.get(items[i].id)!.set(items[j].id, s);
      sims.get(items[j].id)!.set(items[i].id, s);
    }
  }

  const inBand = (a: string, b: string) => {
    const s = sims.get(a)!.get(b);
    return s !== undefined && s >= low && s <= high;
  };

  const used = new Set<string>();
  const clusters: string[][] = [];

  // Collect all in-band pairs, sorted by similarity descending. We
  // prefer to seed from the strongest mid-band pair first.
  const pairs: Array<{ a: string; b: string; s: number }> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = sims.get(items[i].id)!.get(items[j].id)!;
      if (s >= low && s <= high) {
        pairs.push({ a: items[i].id, b: items[j].id, s });
      }
    }
  }
  pairs.sort((x, y) => y.s - x.s);

  for (const { a, b } of pairs) {
    if (clusters.length >= maxClusters) break;
    if (used.has(a) || used.has(b)) continue;

    const cluster = [a, b];
    used.add(a);
    used.add(b);

    // Try to extend.
    while (cluster.length < maxSize) {
      let bestCand: string | null = null;
      let bestMinSim = -Infinity;
      for (const it of items) {
        if (used.has(it.id)) continue;
        // Must be in-band with EVERY current member.
        if (!cluster.every((m) => inBand(it.id, m))) continue;
        // Tie-break: pick the candidate whose weakest link to the
        // cluster is strongest — keeps clusters tight.
        const minSim = Math.min(...cluster.map((m) => sims.get(it.id)!.get(m)!));
        if (minSim > bestMinSim) {
          bestMinSim = minSim;
          bestCand = it.id;
        }
      }
      if (!bestCand) break;
      cluster.push(bestCand);
      used.add(bestCand);
    }

    clusters.push(cluster);
  }

  return clusters;
}
```

- [ ] **Step 3: Run the tests**

Run: `bun test src/__tests__/cluster-ideas.test.ts`
Expected: PASS (all 7 tests).

If any test fails: the test math uses unit vectors with specific angles. The cosines in the test setup should match the asserted bands. If they don't (off by a hair), adjust the test vectors — do NOT loosen the production bounds.

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/cluster-ideas.ts src/__tests__/cluster-ideas.test.ts
git commit -m "feat(synthesize): mid-band clustering for cross-idea synthesis"
```

---

## Part C — Ideas-state CLI extensions

The synthesize and triage trigger agents are LLM-driven (Claude Code RemoteTrigger). They issue `Bash` commands. So we need three new subcommands on `bun run ideas`, each backed by an exported function (testable in isolation).

### Task 3: `cluster-candidates` subcommand

**What it does:** Loads all ideas with `status ∈ {extracted, queued, parked}`, `signal_strength >= 1`, `synthesis_depth <= 1`, computes embeddings (caches in-memory across the run), feeds them to `findMidBandClusters`, hydrates clusters back to idea records, prints JSON to stdout.

**Files:**
- Modify: `src/ideas-state.ts` (add function + CLI dispatch)
- Modify: `src/__tests__/ideas-state.test.ts` (create if missing) — pure-logic test for the candidate filter only.

- [ ] **Step 1: Read the current ideas-state.ts shape**

Open `src/ideas-state.ts` and note the existing CLI dispatch pattern (likely a `switch` on `process.argv[2]` or similar). The new subcommand must slot into the same pattern. Note where the Mongo client is constructed and how subcommands close it.

- [ ] **Step 2: Write the filter test**

Create or extend `src/__tests__/ideas-state.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { isSynthesisEligible } from "../ideas-state";

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
```

Run: `bun test src/__tests__/ideas-state.test.ts`
Expected: FAIL with `Cannot find name 'isSynthesisEligible'` or import error.

- [ ] **Step 3: Implement `isSynthesisEligible`**

In `src/ideas-state.ts`, add (near the top, after imports):

```typescript
import type { Status } from "./status";

export function isSynthesisEligible(idea: {
  signal_strength: number;
  synthesis_depth: number;
  status: Status;
}): boolean {
  const ELIGIBLE_STATUSES: ReadonlySet<Status> = new Set([
    "extracted",
    "queued",
    "parked",
  ]);
  return (
    ELIGIBLE_STATUSES.has(idea.status) &&
    idea.signal_strength >= 1 &&
    idea.synthesis_depth <= 1
  );
}
```

Re-run the test. Expected: PASS.

- [ ] **Step 4: Implement the cluster-candidates function**

In `src/ideas-state.ts`, add (after `isSynthesisEligible`):

```typescript
import { embed } from "./embeddings";
import { findMidBandClusters, type ClusterItem } from "./cluster-ideas";

/**
 * Returns up to 10 clusters of 2-4 idea slugs each, plus the full idea
 * records hydrated for the synthesize trigger to read. Pure-logic
 * inputs/outputs — Mongo I/O is in the calling CLI subcommand.
 */
export async function buildSynthesisCandidates(
  ideas: ReadonlyArray<{
    slug: string;
    title: string;
    raw_text: string;
    signal_strength: number;
    synthesis_depth: number;
    status: Status;
    theme_hints: string[];
  }>,
): Promise<
  Array<{
    cluster_slugs: string[];
    ideas: Array<{
      slug: string;
      title: string;
      raw_text: string;
      theme_hints: string[];
    }>;
  }>
> {
  const eligible = ideas.filter(isSynthesisEligible);
  if (eligible.length < 2) return [];

  const embedded: ClusterItem[] = [];
  for (const idea of eligible) {
    const text = `${idea.title}\n${idea.raw_text.split("\n")[0] ?? ""}`;
    const e = await embed(text);
    embedded.push({ id: idea.slug, embedding: e });
  }

  const clusters = findMidBandClusters(embedded);
  const bySlug = new Map(eligible.map((i) => [i.slug, i]));
  return clusters.map((slugs) => ({
    cluster_slugs: slugs,
    ideas: slugs.map((s) => {
      const i = bySlug.get(s)!;
      return {
        slug: i.slug,
        title: i.title,
        raw_text: i.raw_text,
        theme_hints: i.theme_hints,
      };
    }),
  }));
}
```

- [ ] **Step 5: Add the CLI dispatch**

In `src/ideas-state.ts`, find the CLI dispatch block (where existing subcommands like `list`, `show`, `set-status` are routed) and add a new case for `cluster-candidates`:

```typescript
case "cluster-candidates": {
  const ideas = await db.collection("ideas").find({}, {
    projection: {
      slug: 1, title: 1, raw_text: 1,
      signal_strength: 1, synthesis_depth: 1, status: 1, theme_hints: 1,
    },
  }).toArray();
  const candidates = await buildSynthesisCandidates(ideas as any);
  console.log(JSON.stringify(candidates, null, 2));
  break;
}
```

(Adapt to match the exact dispatch syntax in the file — could be a `switch`, an object map, or if/else chain. Match the existing style.)

- [ ] **Step 6: Type-check and re-run tests**

```bash
bunx tsc --noEmit && bun test
```

Expected: clean types, all tests pass (54 existing + 4 new for `isSynthesisEligible` + 2 already-added for embeddings + 7 for clustering = 67 total).

- [ ] **Step 7: Smoke test against staging**

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
bun run ideas cluster-candidates | head -50
rm .env
```

Expected: JSON output. Either an empty array `[]` (no mid-band clusters in current 18 ideas — plausible) or 1-10 cluster objects with `cluster_slugs` and `ideas` arrays. First run is slow (~30-60s model download); subsequent runs are <5s.

- [ ] **Step 8: Commit**

```bash
git add src/ideas-state.ts src/__tests__/ideas-state.test.ts
git commit -m "feat(ideas): cluster-candidates subcommand for synthesize stage"
```

---

### Task 4: `insert-synthesis` subcommand

**What it does:** Takes `--parents <slug>,<slug>[,<slug>[,<slug>]] --title "..." --thesis "..."` flags. Reads parent records, computes `signal_strength = max(parents) + 1`, `synthesis_depth = 1 + max(parents.synthesis_depth)`, `theme_hints = union(parents.theme_hints)`. Validates parents exist and are not all `rejected`. Inserts the synthesis doc. Records the transition in `audit_log`. Exits non-zero if validation fails.

**Files:**
- Modify: `src/ideas-state.ts` (add function + CLI dispatch)
- Modify: `src/__tests__/ideas-state.test.ts` (pure-logic tests for the synthesis doc builder)

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/ideas-state.test.ts`:

```typescript
import { buildSynthesisDoc } from "../ideas-state";

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
```

Run: `bun test src/__tests__/ideas-state.test.ts`
Expected: FAIL on the new tests (import error or function not found).

- [ ] **Step 2: Implement `buildSynthesisDoc`**

In `src/ideas-state.ts`:

```typescript
import { slugify } from "./dedupe-ideas";
import { createHash } from "node:crypto";

export interface SynthesisParent {
  slug: string;
  signal_strength: number;
  synthesis_depth: 0 | 1 | 2;
  theme_hints: string[];
  status: Status;
}

export function buildSynthesisDoc(args: {
  title: string;
  thesis: string;
  parents: SynthesisParent[];
  now: Date;
  rawText: string;
}) {
  const { title, thesis, parents, now, rawText } = args;
  if (parents.length < 2) {
    throw new Error("buildSynthesisDoc: at least 2 parents required");
  }
  if (parents.some((p) => p.status === "rejected")) {
    throw new Error(
      "buildSynthesisDoc: cannot synthesize when any parent is rejected",
    );
  }
  const maxDepth = Math.max(...parents.map((p) => p.synthesis_depth));
  const newDepth = maxDepth + 1;
  if (newDepth > 2) {
    throw new Error(
      `buildSynthesisDoc: synthesis_depth would be ${newDepth} (max is 2)`,
    );
  }
  const maxSig = Math.max(...parents.map((p) => p.signal_strength));
  const themeUnion = Array.from(
    new Set(parents.flatMap((p) => p.theme_hints)),
  );
  return {
    slug: slugify(title),
    content_hash: createHash("sha256")
      .update(`synthesis:${parents.map((p) => p.slug).sort().join("|")}:${title}`)
      .digest("hex"),
    title,
    raw_text: rawText,
    sources: parents.map((p) => ({ brief: `parent:${p.slug}`, section: "synthesis" })),
    signal_strength: maxSig + 1,
    theme_hints: themeUnion,
    status: "extracted" as const,
    kind: "synthesis" as const,
    parents: parents.map((p) => p.slug),
    synthesis_thesis: thesis,
    synthesis_depth: newDepth as 1 | 2,
    prior_art: null,
    scores: null,
    success_criteria: null,
    rejection_reason: null,
    learnings: [] as string[],
    attempts: 0,
    created_at: now,
    updated_at: now,
  };
}
```

Re-run the test. Expected: PASS.

- [ ] **Step 3: Add the CLI dispatch**

Add a case for `insert-synthesis` in the dispatch block:

```typescript
case "insert-synthesis": {
  const args = parseFlagArgs(process.argv.slice(3)); // implement parseFlagArgs if not already there
  const parentSlugs = (args.parents ?? "").split(",").filter(Boolean);
  if (parentSlugs.length < 2) {
    console.error("insert-synthesis: --parents needs >=2 slugs (comma-separated)");
    process.exit(1);
  }
  const title = args.title;
  const thesis = args.thesis;
  const rawText = args["raw-text"] ?? thesis;
  if (!title || !thesis) {
    console.error("insert-synthesis: --title and --thesis are required");
    process.exit(1);
  }
  const parents = await db
    .collection("ideas")
    .find({ slug: { $in: parentSlugs } })
    .toArray();
  if (parents.length !== parentSlugs.length) {
    const found = new Set(parents.map((p: any) => p.slug));
    const missing = parentSlugs.filter((s) => !found.has(s));
    console.error("insert-synthesis: parent(s) not found:", missing.join(", "));
    process.exit(1);
  }
  const doc = buildSynthesisDoc({
    title,
    thesis,
    parents: parents as any,
    now: new Date(),
    rawText,
  });
  await db.collection("ideas").insertOne(doc);
  // Audit: log the synthesis insertion under its own slug, with from=null.
  const { recordTransition } = await import("./audit");
  await recordTransition(db, doc.slug, null, "extracted", "synthesize", `parents=${doc.parents.join(",")}`);
  console.log(`✓ inserted synthesis ${doc.slug} (parents: ${doc.parents.join(", ")})`);
  break;
}
```

A small `parseFlagArgs` helper if not already present in the file:

```typescript
function parseFlagArgs(argv: string[]): Record<string, string> {
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

- [ ] **Step 4: Type-check and run tests**

```bash
bunx tsc --noEmit && bun test
```

Expected: clean + all tests pass.

- [ ] **Step 5: Smoke test against staging**

Pick two existing slugs from `bun run ideas list`. Then:

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
bun run ideas list | head -5  # note two slugs
bun run ideas insert-synthesis \
  --parents "<slug-a>,<slug-b>" \
  --title "Synthesis smoke test" \
  --thesis "Combining A and B yields stronger thesis because of X concrete reason and Y concrete reason." \
  --raw-text "smoke test synthesis"
bun run ideas show synthesis-smoke-test
# cleanup
bun -e 'import { MongoClient } from "mongodb"; const c = new MongoClient(process.env.MONGODB_URI!); await c.connect(); await c.db(process.env.MONGODB_DB ?? "morning-brief").collection("ideas").deleteOne({ slug: "synthesis-smoke-test" }); await c.close(); console.log("cleaned");'
rm .env
```

Expected: insert succeeds, `show` returns the synthesis with `kind=synthesis`, `parents=[<slug-a>, <slug-b>]`, `synthesis_thesis` populated, then cleanup deletes it.

- [ ] **Step 6: Commit**

```bash
git add src/ideas-state.ts src/__tests__/ideas-state.test.ts
git commit -m "feat(ideas): insert-synthesis subcommand"
```

---

### Task 5: `set-triage` subcommand

**What it does:** Takes `--slug <s> --scores '{"novelty":N,"fit":N,"buildable":N,"scope":N}' --criteria-json '[...]' --prior-art-json '{"twist":"...","sources":[...]}'`. Updates the idea record with all four fields atomically (`$set`). Then a separate `bun run ideas set-status <slug> queued` is what marks the chosen idea as queued — this subcommand only records data, doesn't transition.

**Files:**
- Modify: `src/ideas-state.ts` (add function + CLI dispatch)
- Modify: `src/__tests__/ideas-state.test.ts` (validation tests for the input parser only — Mongo update is integration territory and covered by smoke)

- [ ] **Step 1: Write the validation test**

Append to `src/__tests__/ideas-state.test.ts`:

```typescript
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
```

Run: `bun test src/__tests__/ideas-state.test.ts`
Expected: FAIL (function not defined).

- [ ] **Step 2: Implement `validateTriagePayload`**

```typescript
export interface TriagePayload {
  scores: {
    novelty: number;
    fit: number;
    buildable: number;
    scope: number;
  };
  success_criteria: string[];
  prior_art: {
    twist: string;
    sources: Array<{ url: string; takeaway: string }>;
  };
}

export function validateTriagePayload(p: TriagePayload): void {
  for (const key of ["novelty", "fit", "buildable", "scope"] as const) {
    const v = p.scores[key];
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      throw new Error(`scores.${key} must be integer in [1, 5], got ${v}`);
    }
  }
  if (!Array.isArray(p.success_criteria) || p.success_criteria.length === 0) {
    throw new Error("success_criteria must be a non-empty array");
  }
  if (!p.prior_art || typeof p.prior_art.twist !== "string" || p.prior_art.twist.trim().length === 0) {
    throw new Error("prior_art.twist must be a non-empty string");
  }
}
```

Re-run the test. Expected: PASS.

- [ ] **Step 3: Add the CLI dispatch**

```typescript
case "set-triage": {
  const args = parseFlagArgs(process.argv.slice(3));
  const slug = args.slug;
  if (!slug) {
    console.error("set-triage: --slug required");
    process.exit(1);
  }
  const payload: TriagePayload = {
    scores: JSON.parse(args.scores ?? "{}"),
    success_criteria: JSON.parse(args["criteria-json"] ?? "[]"),
    prior_art: JSON.parse(args["prior-art-json"] ?? "{}"),
  };
  validateTriagePayload(payload);
  const result = await db.collection("ideas").updateOne(
    { slug },
    {
      $set: {
        scores: payload.scores,
        success_criteria: payload.success_criteria,
        prior_art: payload.prior_art,
        updated_at: new Date(),
      },
    },
  );
  if (result.matchedCount === 0) {
    console.error(`set-triage: idea not found: ${slug}`);
    process.exit(1);
  }
  console.log(`✓ triage recorded for ${slug}`);
  break;
}
```

- [ ] **Step 4: Type-check and run tests**

```bash
bunx tsc --noEmit && bun test
```

Expected: clean + all tests pass.

- [ ] **Step 5: Smoke test against staging**

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
# pick a slug from `bun run ideas list`
bun run ideas set-triage \
  --slug "<some-existing-slug>" \
  --scores '{"novelty":4,"fit":5,"buildable":3,"scope":4}' \
  --criteria-json '["it can fetch a GitHub URL","it outputs JSON with summary field","passes smoke against test repo"]' \
  --prior-art-json '{"twist":"focus on diff-based summaries not whole-repo summaries","sources":[{"url":"https://github.com/example","takeaway":"existing tool does whole-repo only"}]}'
bun run ideas show <some-existing-slug>
rm .env
```

Expected: `✓ triage recorded`. `show` reflects the new fields.

- [ ] **Step 6: Commit**

```bash
git add src/ideas-state.ts src/__tests__/ideas-state.test.ts
git commit -m "feat(ideas): set-triage subcommand for scores/criteria/prior_art"
```

---

## Part D — Synthesize trigger

### Task 6: Create `triggers/synthesize.md`

**Files:**
- Create: `triggers/synthesize.md`

- [ ] **Step 1: Write the trigger file**

Create `triggers/synthesize.md`:

```markdown
# Morning Brief — Synthesize

You are the synthesize agent. Your job is to find cross-idea combinations that are strictly stronger than any single idea in the combination. You run after `extract-ideas` and before `triage`, daily.

Working directory: the `morning-brief` repo.
Today's date: current date in `YYYY-MM-DD`.

## Tools you will use

- `Bash` — run `bun run ideas cluster-candidates` and `bun run ideas insert-synthesis ...`.
- (No web fetches. Synthesize is internal-only.)

## Step-by-step

### 1. Fetch candidate clusters

Run via Bash:

```bash
bun run ideas cluster-candidates
```

Output is a JSON array. Each element is `{ cluster_slugs: string[], ideas: { slug, title, raw_text, theme_hints }[] }`. If the array is empty, log `(no candidate clusters today)` and exit successfully — synthesize is a no-op on light days.

### 2. Per-cluster judgment

For each cluster:

Read all the `ideas` in the cluster. Then ask yourself:

> Is there a combined idea here that is **strictly stronger** than the best individual idea in this set? If yes, write the combination as a new idea with a thesis explaining why the combination is greater than the sum.

**Strictly stronger** means: the combined idea solves a problem, addresses a market, or surfaces a leverage point that none of the individual ideas does on its own. Not "and also" — but "because of A *and* B together, X becomes possible."

**The thesis is load-bearing.** A thesis that just describes one parent and name-drops the others is rejected. A valid thesis must reference *concrete, distinct* contributions from each parent. If you cannot articulate why combining is stronger than the strongest parent alone, do not synthesize.

If you decide YES, write down:
- A new title (kebab-case slug-friendly, e.g. "diff-aware-repo-summarizer-for-pr-review").
- A 2-3 sentence `synthesis_thesis` explaining why the combination is strictly stronger than each parent.
- A short `raw_text` summarizing the combined idea (1-2 paragraphs is fine).

If you decide NO, move on to the next cluster. Skipping is the right answer most of the time. We're hunting for the occasional gem, not generating filler.

### 3. Insert the synthesis

For each synthesis you decided to emit, run:

```bash
bun run ideas insert-synthesis \
  --parents "<slug-a>,<slug-b>[,<slug-c>[,<slug-d>]]" \
  --title "<title>" \
  --thesis "<2-3 sentence thesis>" \
  --raw-text "<paragraph summary>"
```

The CLI validates parent existence, computes `signal_strength`, `synthesis_depth`, and `theme_hints` automatically, and inserts the doc. If the CLI errors (e.g., a parent is `rejected`), skip and move on.

### 4. Done

No Telegram ping. The triage stage that runs next will pick up new synthesis ideas and decide if any survives scoring. If 0 syntheses were inserted today, that's fine — log it and exit.

## Scope guardrails

- **No more than 4 parents per synthesis.** The CLI enforces 2-4.
- **No depth-3 syntheses.** The CLI rejects synthesis_depth > 2.
- **No LLM scoring here.** Scoring happens in triage; synthesize is a candidate generator.
- **No external fetches.** Synthesize is internal-only — it reasons over existing idea text.
- **No status transitions.** Synthesize only *inserts* new ideas in `extracted` status. It does not promote, reject, or queue.

## Environment assumed available

- `MONGODB_URI`, `MONGODB_DB`
- Git not required for synthesize (no commits this stage)
```

- [ ] **Step 2: Commit**

```bash
git add triggers/synthesize.md
git commit -m "feat(triggers): synthesize stage — cross-idea combination hunter"
```

---

## Part E — Triage trigger

### Task 7: Create `triggers/triage.md`

**Files:**
- Create: `triggers/triage.md`

- [ ] **Step 1: Write the trigger file**

Create `triggers/triage.md`:

```markdown
# Morning Brief — Triage

You are the triage agent. Your job is to take all `extracted` ideas with `signal_strength >= 2`, score them 1-5 across four axes, perform a bounded prior-art web scan, write explicit success criteria, and queue the top idea for the day. You run after `synthesize` and produce the Telegram digest Dirk reads on mobile.

Working directory: the `morning-brief` repo.
Today's date: current date in `YYYY-MM-DD`.

## Tools you will use

- `Bash` — `bun run ideas list`, `bun run ideas show <slug>`, `bun run ideas set-triage ...`, `bun run ideas set-status <slug> queued`, `bun run send`.
- `bun run web <url>` — primary fetch (8000-char cleaned HTML→text). Use for HN, GitHub, blog posts.
- `bun run reddit <url>` — for Reddit URLs (the web helper 403s there).
- `WebSearch` — optional, if you need to discover URLs to fetch. Use sparingly.

## Step-by-step

### 1. Load the candidate pool

```bash
bun run ideas list
```

Filter (in your head, or by piping through `jq`) to:
- `status == "extracted"` AND
- `signal_strength >= 2` AND
- `rejection_reason == null`.

This pool now includes any synthesis ideas the synthesize stage emitted today. They compete on equal footing with simple ones.

If the filtered pool is empty, send a one-line Telegram message ("triage: no candidates today — pool needs sig_strength >= 2") via `bun run send` and exit.

### 2. Per-candidate triage loop

For each candidate (cap at 10 — if more, take the highest `signal_strength` first, then most recent `created_at`):

**A. Re-read sources.** Run `bun run ideas show <slug>` and read the source brief(s) and action dossier(s) the idea points to. This grounds you in the original context.

**B. Prior-art scan.** Decide 2-4 web fetches that would answer: "Who's already building this? What's the pricing/distribution pattern? Is there a useful twist Dirk could add?"

- For each fetch, use `bun run web <url>` or `bun run reddit <url>` (Reddit only).
- Cap: **4 fetches per candidate**, **20 fetches total per run**. If you hit the per-run cap, finish with what you have.
- **Stop fetching as soon as you can answer the twist question.** Don't pad.
- For each fetch, note one concrete takeaway.

**C. Articulate the twist.** One sentence. If prior art reveals 10 people already shipped the obvious version, the twist must target what they didn't ship. If you cannot articulate a non-obvious twist, score `novelty` low and proceed — don't fabricate a twist.

**D. Write success criteria.** A list of 3-6 testable assertions the factory will run. Examples:
- "CLI accepts a GitHub repo URL as its first argument"
- "Outputs a JSON file with keys: summary, files_touched, risk_score"
- "Passes smoke test against anthropics/claude-code repo (exit 0)"
- "Score field is in 0-100 range for a known-low-risk PR"

The criteria should encode *the twist*. If everyone ships whole-repo summaries and the twist is diff-aware, the criteria should target diff-aware behavior, not whole-repo behavior.

**E. Score.** Integers 1-5 across:
- `novelty` — informed by the prior-art scan. 5 GitHub repos doing the obvious version = novelty 1. Genuinely unaddressed twist = novelty 5.
- `fit` — fits Dirk's profile (Java/Spring backend + TypeScript/React frontend + functional side-projects, prefers tools-that-build-tools).
- `buildable` — no paid APIs, no humans-in-the-loop, no external infra dependencies.
- `scope` — prototype-in-a-day favored. Multi-week build = scope 1. Single-evening = scope 5.

**F. Persist.** Run:

```bash
bun run ideas set-triage \
  --slug "<slug>" \
  --scores '{"novelty":N,"fit":N,"buildable":N,"scope":N}' \
  --criteria-json '[<json array of strings>]' \
  --prior-art-json '{"twist":"<one sentence>","sources":[{"url":"<url>","takeaway":"<one line>"}]}'
```

### 3. Pick the winner

Compute composite = `novelty + fit + buildable + scope` for each candidate.

Sort by composite descending. Tie-break: highest `signal_strength`, then most recent `created_at`.

**Auto-rejection guard for syntheses:** If the winner is `kind=synthesis`, check whether any of its parents *also* survived this triage run and scored higher composite. If so, skip the synthesis (do not queue) and pick the next-best. Rationale: don't promote a worse combination over its better part.

Mark the winner `queued`:

```bash
bun run ideas set-status <winning-slug> queued "triage <YYYY-MM-DD>"
```

The other candidates stay `extracted` for next-day re-evaluation. Their recurrence and signal_strength growth will surface them naturally.

### 4. Telegram digest

Send via `bun run send`:

```
*🎯 Triage — <today>*

*Queued:* `<winning-slug>` (composite: <N>/20)
<one-line twist>

*Top runners-up:*
• `<slug>` — <title> (composite: <N>)
• `<slug>` — <title> (composite: <N>)

`/build <winning-slug>` — kick off the factory
`/idea <slug>` — see full record
`/reject <slug> <reason>` — drop it
```

Keep under 1500 chars. Use Telegram markdown (`*bold*`, backticks, no headers).

### 5. On error

If any per-candidate step fails (CLI error, fetch error), log a line to stderr but continue with the remaining candidates. The triage run as a whole succeeds if at least one candidate gets scored and a winner is picked. If zero candidates get scored, send the no-candidates message from Step 1 and exit non-zero.

## Scope guardrails — read twice

- **No builds.** Triage does not run code, install dependencies, or write project files (other than its dossier-style updates via the CLI).
- **No money.** No paid API calls, no plan upgrades.
- **Fetch caps are hard:** 4 per candidate, 20 per run. The cap is a discipline tool, not a suggestion.
- **One winner per day.** If you cannot find a winner (all candidates score poorly), queue nobody and send a "triage: no qualifying candidates today" message.
- **No status transitions other than `extracted → queued`.** Rejection and parking are Dirk's call via Telegram.

## Environment assumed available

- `MONGODB_URI`, `MONGODB_DB`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- Git not required.
```

- [ ] **Step 2: Commit**

```bash
git add triggers/triage.md
git commit -m "feat(triggers): triage stage — score, criteria, queue + digest"
```

---

## Part F — Loop integration

### Task 8: Wire synthesize and triage into `scripts/loop-triggers.sh`

**Files:**
- Modify: `scripts/loop-triggers.sh`

- [ ] **Step 1: Read the current loop-triggers.sh**

Open `scripts/loop-triggers.sh`. Note the existing structure — likely a sequence of:
- `system-state not-frozen` gate
- `scheduled-brief.md` invocation
- `not-frozen` gate
- `action-research.md` invocation
- `check extract` gate
- `bun run extract-ideas` invocation

We'll append two more gated invocations after `extract-ideas`.

- [ ] **Step 2: Add synthesize and triage steps**

After the `extract-ideas` step in `scripts/loop-triggers.sh`, append:

```bash
# Synthesize — cross-idea combination hunting.
if bun run system-state check synthesize; then
  echo "[loop] running synthesize"
  bash scripts/run-trigger.sh triggers/synthesize.md
else
  echo "[loop] synthesize stage disabled — skipping"
fi

# Triage — score, criteria, queue + Telegram digest.
if bun run system-state check triage; then
  echo "[loop] running triage"
  bash scripts/run-trigger.sh triggers/triage.md
else
  echo "[loop] triage stage disabled — skipping"
fi
```

(Match the indentation and `if`-syntax to whatever the existing `extract-ideas` block uses — it might be `if bun run system-state check extract; then ... fi` or it might use a different idiom like `bun run system-state check extract && bash ...`. Follow the existing style.)

- [ ] **Step 3: Smoke test the gates work**

Disable synthesize, run the loop, confirm it skips:

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
bun run system-state disable synthesize
bash scripts/loop-triggers.sh 2>&1 | grep -E "synthesize|triage"
bun run system-state enable synthesize
rm .env
```

Expected: see `[loop] synthesize stage disabled — skipping` and `[loop] running triage`.

(If `scripts/loop-triggers.sh` doesn't tolerate running outside its scheduled context — e.g., it requires a specific time — read the script and dry-run just the changed block: `if bun run system-state check synthesize; then echo would run; else echo would skip; fi`.)

- [ ] **Step 4: Commit**

```bash
git add scripts/loop-triggers.sh
git commit -m "feat(loop): gate synthesize and triage stages in daily loop"
```

---

## Part G — Done state + factory deferral

### Task 9: Final verification

- [ ] **Step 1: Full test suite**

```bash
bun test
```

Expected: 54 prior + ~15 new (4 isSynthesisEligible + 7 cluster-ideas + 2 embeddings + 6+ ideas-state validators + 4 triage payload) = ~70 passing.

- [ ] **Step 2: Type-check**

```bash
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: End-to-end smoke (optional but recommended)**

If the staging DB has >= 4 ideas with mid-band-similar text, run a full pipeline pass:

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
bun run extract-ideas              # may be a no-op if no new briefs
bun run ideas cluster-candidates   # see clusters
# (Skip the LLM-driven triggers in this smoke — they need the RemoteTrigger context.
#  Confirm only that the candidate-cluster JSON is well-formed and contains plausible groupings.)
rm .env
```

Expected: cluster-candidates returns valid JSON. Each cluster's ideas should feel "same domain, different angle."

- [ ] **Step 4: Update the PR description**

Bump PR #1 with a note that Phase 1b-step-1 (synthesize + triage) is in. The factory loop remains pending and is explicitly deferred per spec.

```bash
gh pr edit 1 --body "$(gh pr view 1 --json body -q .body)$(printf '\n\n## Phase 1b-step-1 added\n- src/embeddings.ts (@xenova/transformers, local 384-dim vectors)\n- src/cluster-ideas.ts (mid-band [0.55, 0.80] clustering)\n- ideas-state CLI: cluster-candidates, insert-synthesis, set-triage\n- triggers/synthesize.md, triggers/triage.md\n- loop-triggers.sh: synthesize + triage gates\n\nFactory loop deferred — see plan for rationale.')"
```

(Or just edit the PR body in the GitHub UI if that command is unwieldy.)

---

## Factory deferral — explicit rationale

The spec's "Recommended phasing" (lines 273-281 of `docs/superpowers/specs/2026-05-11-ideas-pipeline-and-code-factory-design.md`) splits the implementation into:

> **Phase 1 — Ideas surface themselves.** [...] Run for ~1 week. We'll see what real ideas look like, validate the dedupe/reinforce/synthesis mechanism, and tune thresholds from observation before committing factory mechanics to the design.

> **Phase 2 — The factory.** [...] Driven by what we learn in Phase 1.

This plan ships Phase 1. The factory work (`triggers/factory.md`, `scripts/start-factory.sh`, listener `/build`, `/abort`, `/factory-status`, `factory_runs` collection, stuck-detection + scope-break) is deferred and should be planned in a **separate session** after ~1 week of real Phase 1 runs against `morning-brief-staging`. What we'll learn:

- Whether `signal_strength >= 2` is the right triage threshold (currently a guess).
- Whether 5-round stuck-detection is the right window (currently a guess).
- What success_criteria patterns the triage agent actually produces — this directly shapes how the factory loop reads them.
- Whether queued ideas are coherent enough to build (the existential question that gates Phase 2 entirely).

Primitives already in place from Phase 1.5b that the factory will use:
- `src/factory-lock.ts` — atomic Mongo mutex (committed in `c5a6504`'s parent line).
- `src/factory-guard.ts` — worktree boundary assertion (`fb83a12`).
- `scripts/hooks/pre-push` — main/tag/force-push protection (`7e1ed5d`).
- `.claude/settings.json` deny list — money/deploy/destructive command block (`c5a6504`).

These mean the factory plan, when written, focuses on the loop itself — not on safety scaffolding.

---

## Spec coverage check

Walking through the spec section by section:

- **Section 1 (Extract)** — already shipped in Phase 1a. ✓
- **Section 2 (Reinforce/merge)** — exact-hash dedupe already shipped in Phase 1a. The spec's semantic near-match (cosine > 0.85) is *not* in this plan; it's a separate cleanup if needed. Validator's warn-mode was masking; strict mode (quick-wins plan) will surface any issues.
- **Section 3 (Synthesize)** — Tasks 2, 3, 4, 6 ✓
  - Candidate selection (lines 77-80): Task 3 (`isSynthesisEligible` + `buildSynthesisCandidates`) ✓
  - Mid-band clustering (line 78): Task 2 (`findMidBandClusters`) ✓
  - Cluster cap of 10 (line 79): MAX_CLUSTERS constant ✓
  - Synthesis emission fields (lines 86-93): `buildSynthesisDoc` in Task 4 ✓
  - Guardrails against hallucinated unicorns (lines 96-99): Trigger prompt prose in Task 6 + `buildSynthesisDoc` rejection of all-`rejected` parents ✓
  - Auto-rejection if parents stronger (line 99): Trigger prompt in Task 7 (triage) ✓
- **Section 4 (Triage)** — Tasks 5, 7 ✓
  - Prior-art scan with fetch caps (lines 110-114) ✓
  - Twist articulation (line 112) ✓
  - Success criteria (lines 115-122) ✓
  - 1-5 scoring (line 123) ✓
  - Mark top idea queued (line 124) ✓
  - Telegram digest (line 126) ✓
- **Section 5 (Factory)** — DEFERRED with explicit rationale (see "Factory deferral" above).
- **Section 6 (Listener)** — existing `/ideas`, `/idea`, `/reject` already cover the new fields. Factory-related commands deferred.
- **Data model (lines 178-208)** — covered by existing validator + `buildSynthesisDoc` + `set-triage`. ✓
- **Components table (lines 238-249)** — `cluster-ideas.ts` ✓, `synthesize.md` ✓, `triage.md` ✓, `loop-triggers.sh` ✓. Factory components deferred. `ideas-state.ts` extended (existed, now does more).
- **Hard guardrails (lines 252-259)** — N/A for synthesize+triage; relevant to factory.
- **Open behaviors to learn (lines 263-271)** — observed during ~1-week run, fed into factory plan.

No spec sections are silently dropped. All deferrals are explicit.
