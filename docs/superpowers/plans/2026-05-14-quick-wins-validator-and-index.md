# Quick Wins: Validator Promotion + Compound Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the `ideas` `$jsonSchema` validator from `warn` to `error` (after verifying zero real-data violations), convert the schema's `oneOf`-negation conditionals to draft-7 `if/then` form (closes a vacuous-pass edge case), and add a compound `{status, signal_strength}` index for triage queries.

**Architecture:** Three independent, low-risk changes to `scripts/init-db.ts`. Compound index is one `createIndex` call. Schema conversion preserves semantics — every constraint that held under `oneOf`-negation also holds under `if/then`, with the bonus of rejecting documents that omit the trigger field. Validator promotion is gated by a verification script that finds documents violating the new schema *before* flipping `validationAction` from `warn` to `error`.

**Tech Stack:** Bun + TypeScript + MongoDB (5.0+ for draft-7 `if/then` support).

**Working directory:** `/Users/dirkknibbe/morning-brief/.claude/worktrees/busy-chandrasekhar-b7e90a`

**Environment:** `MONGODB_URI` lives in the main repo's `.env` (not the worktree's). Symlink before running live commands: `ln -s /Users/dirkknibbe/morning-brief/.env .env`, remove after with `rm .env`. **Never `cat` the .env file.** `MONGODB_DB=morning-brief-staging` is the active DB.

---

## Task 1: Add compound `{status: 1, signal_strength: -1}` index

**Why:** Triage queries filter on `status` and sort by `signal_strength`. A compound index serves both selection and sort in one B-tree walk. Single-key indexes on `status` and `signal_strength` already exist in `init-db.ts:137-138`, but Mongo cannot combine them efficiently for a sorted filter.

**Files:**
- Modify: `scripts/init-db.ts` (after line 138, before `createIndex({ created_at: -1 })`)

- [ ] **Step 1: Add the createIndex call**

Add this line in `scripts/init-db.ts` immediately after the existing `signal_strength: -1` index creation (line 138):

```typescript
  await db.collection("ideas").createIndex({ status: 1, signal_strength: -1 });
```

The full block (around lines 134-140) should read:

```typescript
  await db.collection("ideas").createIndex({ slug: 1 }, { unique: true });
  try { await db.collection("ideas").dropIndex("content_hash_1"); } catch {}
  await db.collection("ideas").createIndex({ content_hash: 1 }, { unique: true });
  await db.collection("ideas").createIndex({ status: 1 });
  await db.collection("ideas").createIndex({ signal_strength: -1 });
  await db.collection("ideas").createIndex({ status: 1, signal_strength: -1 });
  await db.collection("ideas").createIndex({ created_at: -1 });
  console.log("✓ ideas indexes");
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Smoke run against staging**

Symlink the env, run init-db, remove symlink:

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
bun run init-db
rm .env
```

Expected: `✓ ideas indexes` line prints once. No errors. (createIndex is idempotent by name — re-runs are safe.)

- [ ] **Step 4: Verify the index exists**

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
bun -e 'import { MongoClient } from "mongodb"; const c = new MongoClient(process.env.MONGODB_URI!); await c.connect(); const idx = await c.db(process.env.MONGODB_DB ?? "morning-brief").collection("ideas").indexes(); console.log(idx.find(i => i.name === "status_1_signal_strength_-1")); await c.close();'
rm .env
```

Expected: prints an object with `key: { status: 1, signal_strength: -1 }`. If `undefined`, the index didn't get created — re-check Step 1.

- [ ] **Step 5: Commit**

```bash
git add scripts/init-db.ts
git commit -m "feat(db): compound {status, signal_strength} index on ideas"
```

---

## ~~Task 2: Convert validator conditionals to draft-7 `if/then`~~ — **SKIPPED on 2026-05-14**

**Why skipped:** MongoDB's `$jsonSchema` validator does NOT support draft-7 `if/then/else` keywords (despite some external commentary suggesting otherwise). An attempted conversion failed at `collMod` time with `Parsing of collection validator failed :: caused by :: Unknown $jsonSchema keyword: if`. Tested against MongoDB 8.0.23.

**Why the vacuous-pass concern is not exploitable in our schema anyway:** The outer schema at `scripts/init-db.ts:16-28` already declares `status` and `kind` in the `required` array. Any document missing those fields fails the outer schema check before the `allOf → oneOf` conditional is reached. The vacuous-pass branch (`{ properties: { status: { not: ... } } }` matching when `status` is absent) therefore has no path to actually slip a bad document through.

The original `oneOf-negation` form (`init-db.ts:61-86`) is retained.

This finding was discovered during execution and the broken conversion commit was reverted in `3d269fd`.

**Original Task 2 description (kept for the historical record, no longer to be executed):**

**Files:**
- Modify: `scripts/init-db.ts:61-86` (replace the `allOf` block)

- [ ] **Step 1: Replace the `allOf` block**

In `scripts/init-db.ts`, replace lines 61-86 (the entire `allOf: [ ... ]` array, including the closing `]`) with:

```typescript
    allOf: [
      // If status is "building", success_criteria must be a non-empty array.
      {
        if: {
          required: ["status"],
          properties: { status: { enum: ["building"] } },
        },
        then: {
          required: ["success_criteria"],
          properties: {
            success_criteria: { bsonType: "array", minItems: 1 },
          },
        },
      },
      // If kind is "synthesis", parents/synthesis_thesis required and depth >= 1.
      {
        if: {
          required: ["kind"],
          properties: { kind: { enum: ["synthesis"] } },
        },
        then: {
          required: ["parents", "synthesis_thesis"],
          properties: {
            parents: { bsonType: "array", minItems: 2 },
            synthesis_thesis: { bsonType: "string", minLength: 1 },
            synthesis_depth: {
              bsonType: ["int", "long"],
              minimum: 1,
              maximum: 2,
            },
          },
        },
      },
    ],
```

Note: the `enum: ["building"]` inside `if.properties.status` uses `enum` (not `const`) for consistency with the existing schema style and to keep the type-check options open if we ever want to expand the condition.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Apply the new schema in warn mode (still warn — promotion is Task 3)**

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
bun run init-db
rm .env
```

Expected: `✓ ideas validator (warn mode)` line. No errors. The validator is updated server-side but still only warns on violations.

- [ ] **Step 4: Commit**

```bash
git add scripts/init-db.ts
git commit -m "refactor(db): convert ideas validator to draft-7 if/then form"
```

---

## Task 3: Write the validator-violation verification script

**Why:** Before flipping `validationAction` from `warn` to `error`, we must prove no existing document violates the schema — otherwise the next write that touches a violating doc will fail loudly in prod. The warn-mode validator already logs violations to the Mongo server log, but querying the log requires Atlas-level access. Easier: ask Mongo itself for documents NOT matching the schema, via `$nor` + `$jsonSchema`.

**Files:**
- Create: `scripts/verify-ideas-validator.ts`

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-ideas-validator.ts` with:

```typescript
/**
 * verify-ideas-validator.ts — find any ideas docs that violate the current
 * $jsonSchema validator. Used before promoting the validator from warn to
 * error mode.
 *
 * Exits 0 with `OK — 0 violations` if clean.
 * Exits 1 and prints offending _ids + per-doc validation errors otherwise.
 */

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "morning-brief";

if (!uri) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);

  // Fetch the validator currently applied to the ideas collection.
  const collInfo = await db
    .listCollections({ name: "ideas" }, { nameOnly: false })
    .toArray();
  const validator = collInfo[0]?.options?.validator;
  if (!validator) {
    console.error("No validator on ideas collection — run init-db first.");
    process.exit(1);
  }

  // Find any docs that do NOT match the validator.
  const violators = await db
    .collection("ideas")
    .find({ $nor: [validator] })
    .project({ _id: 1, slug: 1, status: 1, kind: 1 })
    .toArray();

  if (violators.length === 0) {
    console.log("OK — 0 violations across", await db.collection("ideas").countDocuments(), "ideas");
    process.exit(0);
  }

  console.error(`FAIL — ${violators.length} document(s) violate the validator:`);
  for (const v of violators) {
    console.error("  -", v.slug ?? v._id, `(status=${v.status}, kind=${v.kind})`);
  }
  process.exit(1);
} finally {
  await client.close();
}
```

- [ ] **Step 2: Add a package.json script**

In `package.json`, add to the `scripts` block:

```json
"verify-validator": "bun run scripts/verify-ideas-validator.ts",
```

(Place it alphabetically after `system-state`, before `test`.)

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Run against staging**

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
bun run verify-validator
rm .env
```

Expected: `OK — 0 violations across 18 ideas` (or whatever the current count is).

If non-zero violations: **STOP.** Read each violating slug, fix the data or the schema, then re-run. Do **not** proceed to Task 4 until this is clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-ideas-validator.ts package.json
git commit -m "feat(db): verify-validator script for pre-promotion check"
```

---

## Task 4: Promote validator from `warn` to `error`

**Why:** Now that Task 3 proved no real document violates the schema, flipping to error mode makes the validator load-bearing — bad writes get rejected at insert/update time, not silently logged.

**Files:**
- Modify: `scripts/init-db.ts:149` (change `"warn"` to `"error"`)

- [ ] **Step 1: Confirm Task 3 passed**

Re-run the verification before flipping:

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
bun run verify-validator
```

Expected: `OK — 0 violations`. If not, **STOP**, fix violators, re-run.

(Leave the symlink in place for Step 3.)

- [ ] **Step 2: Flip `validationAction`**

In `scripts/init-db.ts`, change line 149 from:

```typescript
    validationAction: "warn",
```

to:

```typescript
    validationAction: "error",
```

Also update the comment block at lines 142-144 to reflect the new state:

```typescript
  // Apply $jsonSchema validator in STRICT mode. Promoted from warn after
  // verify-ideas-validator.ts confirmed zero violations against real data
  // on 2026-05-14.
```

- [ ] **Step 3: Apply the strict validator**

```bash
bun run init-db
```

Expected: `✓ ideas validator (warn mode)` line — wait, the log message is now stale. Update it.

- [ ] **Step 4: Update the log message**

In `scripts/init-db.ts`, find the `console.log` line that says `"✓ ideas validator (warn mode)"` (immediately after the `collMod` command) and change it to:

```typescript
  console.log("✓ ideas validator (strict mode)");
```

Re-run:

```bash
bun run init-db
rm .env
```

Expected: `✓ ideas validator (strict mode)`. No errors.

- [ ] **Step 5: Smoke test — attempt to insert a bad document**

Confirm the validator now rejects writes. Run:

```bash
ln -s /Users/dirkknibbe/morning-brief/.env .env
bun -e 'import { MongoClient } from "mongodb"; const c = new MongoClient(process.env.MONGODB_URI!); await c.connect(); try { await c.db(process.env.MONGODB_DB ?? "morning-brief").collection("ideas").insertOne({ slug: "test-bad", kind: "synthesis", status: "extracted" } as any); console.log("FAIL — bad doc was accepted"); } catch (e) { console.log("OK — rejected:", (e as Error).message.slice(0, 100)); } finally { await c.close(); }'
rm .env
```

Expected output starts with `OK — rejected: Document failed validation` (or similar — Mongo's wording). If it prints `FAIL — bad doc was accepted`, the validator is not in error mode — re-check Steps 2-4.

- [ ] **Step 6: Run the full test suite**

```bash
bun test
```

Expected: 54/54 passing (same as before — no test should depend on the warn mode permissiveness).

- [ ] **Step 7: Commit**

```bash
git add scripts/init-db.ts
git commit -m "feat(db): promote ideas validator from warn to strict mode"
```

---

## Done state

After all four tasks:
- New compound index `{status: 1, signal_strength: -1}` exists on `ideas`.
- Validator uses draft-7 `if/then` (no vacuous-pass edge case).
- Validator is in strict (`error`) mode.
- A reusable `bun run verify-validator` exists for future schema changes.
- All commits pushed (or stay local until Task 1 of any later plan needs them).
- 54/54 tests still pass; `bunx tsc --noEmit` clean.

## Spec coverage check

- Spec line 45 (handoff): "flip the `ideas` `$jsonSchema` validator from `warn` → `error`" — Task 4 ✓
- Spec line 45 (handoff): "converting the schema's `oneOf`-negation to JSON Schema draft-7 `if/then` form" — Task 2 ✓
- Spec line 47 (handoff): "Compound `{status: 1, signal_strength: -1}` index on `ideas`" — Task 1 ✓
- Handoff says "Add when collection grows past hundreds of ideas" — we're at 18, so this is forward-looking. Including in this plan anyway because (a) it's a one-liner, (b) it makes triage code in the next plan simpler.
