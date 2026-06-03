# Factory Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the factory substrate (PR #5, now on `main`) into a working autonomous build loop fired by Telegram `/build <slug>`.

**Architecture:** `/build` → listener runs `scripts/start-factory.sh <slug>` → a detached `setsid nohup` process group runs `IDEA_SLUG=<slug> run-trigger.sh triggers/factory.md` → the factory trigger acquires the lock (recording its pgid), scaffolds a private repo from `project-template` into `.claude/builds/<slug>`, classifies the criteria, plans against the machine-verifiable ones, and iterates (tests → hypothesis → commit → heartbeat) until done-partial / capped / stuck / scope-break. `/abort` kills the group by the stored pgid; `/factory-status` reports the open run. Most of this layer is prompt + shell glue validated by an end-to-end dry-run, not unit tests.

**Tech Stack:** Bash, `setsid`/`nohup`, the `factory` CLI (from PR #5), `gh`, Claude Code headless (`run-trigger.sh`), MongoDB.

**Spec:** `docs/superpowers/specs/2026-05-31-factory-loop-design.md`
**Depends on:** PR #5 substrate (`src/factory.ts` CLI, `factory_runs`, lock pgid, build-dir guard) — already on `main`.

**Branch:** create `claude/phase-2-factory-orchestration` off `main` before Task 1.

---

### Task 1: Parameterize `run-trigger.sh` for the factory

The factory needs a higher budget ($20 vs the default $5) and must bypass the 21h daily dedupe guard (it's on-demand and the `factory_lock` already enforces one-at-a-time). Two backward-compatible env knobs.

**Files:**
- Modify: `scripts/run-trigger.sh`
- Test: `scripts/__tests__/run-trigger-env.test.ts` (new)

- [ ] **Step 1: Wrap the dedupe guard so `SKIP_DEDUPE=1` bypasses it**

In `scripts/run-trigger.sh`, the guard is the block at lines ~28-37 (the `LAST_RUN=...` through `touch "$LAST_RUN"`). Wrap it:
```bash
# Daily dedupe guard — skipped for on-demand runs (e.g. the factory) via SKIP_DEDUPE=1.
if [ "${SKIP_DEDUPE:-0}" != "1" ]; then
  LAST_RUN="/tmp/morning-brief-${STEM}-last-run"
  if [ -f "$LAST_RUN" ]; then
    AGE=$(( $(date +%s) - $(stat -f %m "$LAST_RUN") ))
    if [ "$AGE" -lt 75600 ]; then
      echo "$(date -Iseconds) $STEM ran ${AGE}s ago (< 21h), skipping" >&2
      exit 0
    fi
  fi
  touch "$LAST_RUN"
fi
```

- [ ] **Step 2: Parameterize the budget**

Change the claude invocation's budget line from:
```bash
    --max-budget-usd 5 \
```
to:
```bash
    --max-budget-usd "${MAX_BUDGET_USD:-5}" \
```

- [ ] **Step 3: Write a behavior test (shell, exercised via bun)**

```ts
// scripts/__tests__/run-trigger-env.test.ts
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../run-trigger.sh", import.meta.url), "utf8");

test("run-trigger honors SKIP_DEDUPE to bypass the 21h guard", () => {
  expect(SRC).toContain('if [ "${SKIP_DEDUPE:-0}" != "1" ]; then');
  // the guard's exit must live inside the SKIP_DEDUPE block
  const guardIdx = SRC.indexOf("SKIP_DEDUPE");
  const exitIdx = SRC.indexOf("(< 21h), skipping");
  expect(guardIdx).toBeGreaterThanOrEqual(0);
  expect(exitIdx).toBeGreaterThan(guardIdx);
});

test("run-trigger budget is overridable via MAX_BUDGET_USD with a $5 default", () => {
  expect(SRC).toContain('--max-budget-usd "${MAX_BUDGET_USD:-5}"');
});
```

- [ ] **Step 4: Run the test + shell syntax check**

Run: `bun test scripts/__tests__/run-trigger-env.test.ts` → Expected: 2 pass.
Run: `bash -n scripts/run-trigger.sh` → Expected: no output (valid).
Confirm the existing daily stages still behave: with neither env var set, the guard and $5 budget are unchanged.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-trigger.sh scripts/__tests__/run-trigger-env.test.ts
git commit -m "feat(loop): run-trigger honors SKIP_DEDUPE + MAX_BUDGET_USD for the factory"
```

---

### Task 2: `scripts/start-factory.sh`

Launches a build as a detached process group. Pre-flight only — the authoritative lock is acquired inside `triggers/factory.md` (which knows its own pgid).

**Files:**
- Create: `scripts/start-factory.sh`
- Test: `scripts/__tests__/start-factory.test.ts` (new)

- [ ] **Step 1: Write the script**

```bash
#!/bin/bash
# start-factory.sh — launch a factory build for one queued idea as a detached
# process group. Called by the Telegram listener on `/build <slug>`.
#
# Pre-flight checks only; the factory trigger acquires the Mongo lock itself
# (it records its own pgid, which /abort uses to kill the group). setsid gives
# the build its own session+group so a single `kill -- -<pgid>` stops the whole
# tree (claude + bun + children).
set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

SLUG="${1:-}"
if [ -z "$SLUG" ]; then
  echo "usage: start-factory.sh <slug>" >&2
  exit 2
fi

[ -f .env ] || { echo "start-factory: .env missing" >&2; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "start-factory: bun not found on PATH" >&2; exit 1; }
command -v gh  >/dev/null 2>&1 || { echo "start-factory: gh not found on PATH" >&2; exit 1; }
command -v setsid >/dev/null 2>&1 || { echo "start-factory: setsid not found (install util-linux or use a setsid shim)" >&2; exit 1; }

# Fast-fail if a build is already running. Authoritative gate is the lock the
# trigger acquires; this is a UX nicety so the listener can reply immediately.
LOCK="$(bun run factory lock-check 2>/dev/null)"
if [ -n "$LOCK" ] && [ "$LOCK" != "null" ]; then
  echo "start-factory: a build is already running: $LOCK" >&2
  exit 3
fi

mkdir -p logs
LOG="logs/factory-${SLUG}-$(date +%Y-%m-%d).log"

setsid nohup env \
  IDEA_SLUG="$SLUG" \
  SKIP_DEDUPE=1 \
  MAX_BUDGET_USD=20 \
  ./scripts/run-trigger.sh triggers/factory.md >>"$LOG" 2>&1 &

echo "started factory for $SLUG (log: $LOG)"
```

NOTE on macOS: `setsid` is not present by default. If `command -v setsid` fails on the target Mac, the implementer must either install it (`brew install util-linux` exposes `gsetsid` — symlink or alias to `setsid`) OR replace the launch line with a portable equivalent that creates a new process group. Document whichever was chosen in a comment. Do NOT silently drop the new-process-group behavior — `/abort`'s group-kill depends on it.

- [ ] **Step 2: Write the test (error paths — no Mongo needed)**

```ts
// scripts/__tests__/start-factory.test.ts
import { test, expect } from "bun:test";

const SCRIPT = new URL("../start-factory.sh", import.meta.url).pathname;

test("exits 2 with usage when no slug is given", async () => {
  const p = Bun.spawn(["bash", SCRIPT], { stdout: "pipe", stderr: "pipe" });
  const code = await p.exited;
  expect(code).toBe(2);
  expect(await new Response(p.stderr).text()).toContain("usage: start-factory.sh");
});

test("script passes shellcheck-style bash -n syntax check", async () => {
  const p = Bun.spawn(["bash", "-n", SCRIPT], { stderr: "pipe" });
  const code = await p.exited;
  expect(code).toBe(0);
});

test("launch line creates a detached group, sets factory env, and skips dedupe", async () => {
  const src = await Bun.file(SCRIPT).text();
  expect(src).toContain("setsid nohup env");
  expect(src).toContain("SKIP_DEDUPE=1");
  expect(src).toContain("MAX_BUDGET_USD=20");
  expect(src).toContain("triggers/factory.md");
});
```

- [ ] **Step 3: chmod + run the test**

```bash
chmod +x scripts/start-factory.sh
bun test scripts/__tests__/start-factory.test.ts
```
Expected: 3 pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/start-factory.sh scripts/__tests__/start-factory.test.ts
git commit -m "feat(factory): start-factory.sh — detached process-group launcher"
```

---

### Task 3: `triggers/factory.md`

The build-loop prompt. No frontmatter (matches `triggers/triage.md`). The complete file:

**Files:**
- Create: `triggers/factory.md`

- [ ] **Step 1: Write the trigger**

````markdown
# Morning Brief — Factory

You are the factory agent. You autonomously build ONE queued idea into a working, PRIVATE GitHub repository, driving toward its machine-verifiable success criteria. You are fired on demand by Telegram `/build <slug>` — the idea slug is in the `IDEA_SLUG` environment variable. You start in the `morning-brief` repo.

## Hard rules
- ONE build at a time — enforced by the Mongo `factory_lock`. If you don't own the lock, STOP.
- Bounded: stop at 20 rounds OR 30 minutes OR stuck-detection. Heartbeat to Telegram every round.
- Human/external criteria (screencasts, "loads in Claude Code", paid signups) are NOT failures — collect them into a handoff checklist; never let them block "done".
- The new repo is PRIVATE. Never run deny-listed commands (publish/deploy/force-push).
- On ANY fatal error: release the lock, finalize the run, send a one-line Telegram failure. Never leave the lock held.

## Step 0 — remember the repo path, gate, and lock
```bash
MB_REPO="$(pwd)"                       # heartbeats run from here
bun run system-state check factory || { echo "factory frozen/disabled"; exit 0; }
PGID=$(ps -o pgid= -p $$ | tr -d ' ')
bun run factory lock-acquire --slug "$IDEA_SLUG" --ttl-ms 3600000 --pid $$ --pgid "$PGID"
```
If the printed JSON has `"acquired": false`, another build holds the lock — STOP now, touch nothing.

## Step 1 — load and claim the idea
```bash
bun run ideas show "$IDEA_SLUG"
```
Confirm `status` is `queued`. If not, run `bun run factory lock-release --slug "$IDEA_SLUG"` and STOP. Read `success_criteria`, `synthesis_thesis`, `title`, `sources`; read the brief/action files in `sources` for context. Then:
```bash
bun run ideas set-status "$IDEA_SLUG" building
```

## Step 2 — classify criteria + open the run
```bash
bun run factory classify --json '<success_criteria as a JSON array>'
```
Review. You MAY correct an obviously-wrong `kind`, but keep the final array. The `human_or_external` entries are your handoff checklist. Open the run (save the id):
```bash
RUN_ID=$(bun run factory run-create --slug "$IDEA_SLUG" --build-dir ".claude/builds/$IDEA_SLUG" --branch main --classification-json '<final classification array>')
```

## Step 3 — scaffold the private repo
```bash
gh repo create "dirkknibbe/$IDEA_SLUG" --private --template dirkknibbe/project-template --clone ".claude/builds/$IDEA_SLUG"
cd ".claude/builds/$IDEA_SLUG"
pwd   # must end in .claude/builds/<slug> — the factory-guard boundary
```
If `gh repo create` fails because the name is taken, append `-v2` (then `-v3`) and retry once or twice; record the actual repo URL for later.

## Step 4 — plan against the machine-verifiable criteria
Invoke the `superpowers:writing-plans` skill to draft a plan covering ONLY the `test` and `scriptable` criteria. Commit it into the repo as `docs/plan.md`. Set up the project's test command (`pytest` for Python, `bun test`/`vitest` for TS) and a small scriptable-assertion runner — a shell script that checks the artifact criteria (file exists, line count, exported symbols, manifest schema).

## Step 5 — iteration loop
Track: `round` (start 1), `START_EPOCH=$(date +%s)`, the per-round `failing_test_count` list, and the per-round `hypothesis` list.

Each round:
1. Run the machine-verifiable suite (tests + scriptable assertions); count failing criteria.
2. **Zero failing → go to Step 6 (done).**
3. Else, check terminators IN ORDER:
   - Caps: `bun run factory cap-check --round <round> --elapsed-ms $(( ($(date +%s) - START_EPOCH) * 1000 ))` → if `capped`, go to Step 6 (capped).
   - Stuck (round ≥ 5): `bun run factory stuck-check --failing-json '<list>' --hypotheses-json '<list>'` → if `stuck`, go to Step 6 (stuck).
   - Scope-break: if a MACHINE criterion would require a paid API / external infra / human action to implement, go to Step 6 (scope-break).
4. Otherwise: pick the smallest-failure-delta criterion, state a one-line hypothesis, implement it TEST-FIRST, then:
   ```bash
   git add -A && git commit -m "round <round>: <hypothesis>"
   bun run factory run-append --id "$RUN_ID" --n <round> --failing <count> --hypothesis "<hypothesis>" --excerpt "<≤2000 chars of test output>"
   printf '%s' "round <round> — <passing>/<total> machine criteria — <hypothesis>" | (cd "$MB_REPO" && bun run send)
   ```
   Increment `round`, loop.

## Step 6 — terminate
`DURATION_S=$(( $(date +%s) - START_EPOCH ))`. In every branch: release the lock, set the idea status, finalize the run, send Telegram.

**done** (all machine criteria pass):
```bash
git push
printf '%s' "✅ built $IDEA_SLUG — all machine criteria pass
<repo URL>
👤 you still need to:
- <each human_or_external criterion, verbatim>" | (cd "$MB_REPO" && bun run send)
cd "$MB_REPO"
bun run factory lock-release --slug "$IDEA_SLUG"
bun run ideas set-status "$IDEA_SLUG" built
bun run factory run-finalize --id "$RUN_ID" --terminator done --repo-url "<url>" --duration-s $DURATION_S
```

**capped** / **stuck**: write `learnings.md` (rounds, hypotheses tried, dead-ends), commit, `git push -u origin HEAD:$IDEA_SLUG-capped` (or `-stuck`). Telegram the status + "see learnings.md". Then from `$MB_REPO`: `lock-release`; `bun run ideas set-status "$IDEA_SLUG" parked`; `run-finalize --terminator capped` (or `stuck`) `--duration-s $DURATION_S`.

**scope-break**: do NOT push a branch. Record the blocker. Telegram "🚧 $IDEA_SLUG needs you: <blocker>". From `$MB_REPO`: `lock-release`; `bun run ideas set-status "$IDEA_SLUG" needs_human`; `run-finalize --terminator scope-break --duration-s $DURATION_S`.
````

- [ ] **Step 2: Validate structure (no execution yet)**

Run: `test -f triggers/factory.md && grep -c '^## Step' triggers/factory.md`
Expected: prints `7` (Steps 0-6).
Confirm it references the real CLI subcommands only: `grep -oE 'factory (lock-acquire|lock-release|lock-check|classify|run-create|run-append|run-finalize|cap-check|stuck-check)' triggers/factory.md | sort -u` — every referenced subcommand must exist in `src/factory.ts`.

- [ ] **Step 3: Commit**

```bash
git add triggers/factory.md
git commit -m "feat(factory): triggers/factory.md build-loop prompt"
```

---

### Task 4: Listener commands (`triggers/listener.md`)

**Files:**
- Modify: `triggers/listener.md`

- [ ] **Step 1: Add a Factory commands section**

After the `## System control commands` section and before `## Rules`, insert:

```markdown
## Factory commands

- `/build <slug>` (or `build <slug>`) — Start a factory build. First check the lock and the idea:
  Run `bun run factory lock-check`. If it returns anything other than `null`, reply `🏭 a build is already running: <idea_slug from the JSON>` and stop.
  Run `bun run ideas show <slug>`; if it errors (unknown slug) relay that; if its `status` is not `queued`, reply `<slug> is <status>, not queued — only queued ideas can be built` and stop.
  Otherwise run `bash scripts/start-factory.sh <slug>` and reply `🏭 building <slug> — heartbeats incoming, /factory-status to check, /abort to stop`.
- `/abort [<slug>]` (or `abort [<slug>]`) — Stop the running build. Run `bun run factory lock-check`. If `null`, reply `no build running`. Otherwise read its `idea_slug` and `pgid`; if a `<slug>` arg was given and doesn't match, reply `running build is <idea_slug>, not <slug> — re-run /abort with no arg to stop it` and stop. Else: `kill -- -<pgid>` (ignore "no such process"), then `bun run factory lock-release --slug <idea_slug>`, then `bun run ideas set-status <idea_slug> queued` (returns it to the queue), and reply `🛑 aborted <idea_slug> — returned to queued, build dir left intact`.
- `/factory-status` (or `factory-status`) — Run `bun run factory lock-check`. If `null`, reply `no build running`. Otherwise read the `idea_slug` and reply with: the idea slug, how long it's been running (now − `started_at`), and a note that detailed per-round progress is in the Telegram heartbeats. Keep it under 1000 chars.
```

- [ ] **Step 2: Validate**

Run: `grep -cE '^- `/(build|abort|factory-status)`' triggers/listener.md`
Expected: `3`.

- [ ] **Step 3: Commit**

```bash
git add triggers/listener.md
git commit -m "feat(listener): /build, /abort, /factory-status commands"
```

---

### Task 5: End-to-end dry-run (MANUAL — has real-world side effects)

This is the real verification. It **spends LLM budget** (up to $20) and **creates a real private GitHub repo**. Do NOT run it autonomously — it requires the user's explicit go-ahead and a `queued` idea (or a deliberately tiny throwaway idea).

**Files:** none (validation)

- [ ] **Step 1: Pick a small target.** Either use the real `queued` idea, or insert a tiny throwaway idea with 2-3 purely machine-verifiable criteria (e.g. "exports `add(a,b)` returning a+b", "README.md exists and is < 50 lines") and queue it. A tiny target keeps the first live run cheap and fast.

- [ ] **Step 2: Pre-flight.** Confirm `bun run factory lock-check` → `null`; `gh auth status` OK; `gh repo view dirkknibbe/project-template` exists; `.env` present. `bun run init-db` (ensures `factory_runs`).

- [ ] **Step 3: Fire it.** From Telegram (or directly): `bash scripts/start-factory.sh <slug>`. Watch the log `logs/factory-<slug>-<date>.log` and the Telegram heartbeats.

- [ ] **Step 4: Confirm the outcome.** On done: a private repo `dirkknibbe/<slug>` exists with commits, the Telegram message has the repo URL + handoff checklist, the idea is `built`, and:
  ```bash
  set -a; . ./.env; set +a
  mongosh "$MONGODB_URI" --quiet --eval "printjson(db.getSiblingDB('$MONGODB_DB').factory_runs.findOne({idea_slug:'<slug>'}, {rounds_log:0}))"
  ```
  shows `terminator: "done"`, `repo_url`, `human_handoff`, `duration_s`.

- [ ] **Step 5: Test `/abort`.** Fire a second build, then `/abort` — confirm the process group dies (`bun run factory lock-check` → `null` within a few seconds), the idea returns to `queued`, and the run is finalized `aborted`.

- [ ] **Step 6: Record learnings.** Note actual cost/round/duration and whether the classifier mis-bucketed anything → these calibrate the deferred budget-estimator and any cap tuning. Capture surprises to `vfs.persistent/gotchas.md`.

---

## Self-review

**Spec coverage:** `start-factory.sh` (Task 2) → spec "execution: setsid nohup"; `factory.md` (Task 3) → the full build flow incl. classify, scaffold-private-repo, plan, loop, the four terminators, done-partial handoff checklist, lock acquire-with-pgid; listener (Task 4) → `/build` `/abort` `/factory-status`; budget+dedupe (Task 1) → the $20 cap + on-demand bypass; dry-run (Task 5) → "trigger validated by one real dry-run build". Deferred (noted, non-blocking): signal_strength −1 on stuck (no CLI yet — parked is sufficient for v1; add an `ideas adjust-signal` CLI later); per-idea-kind template selection; the budget estimator.

**Placeholder scan:** the `<...>` tokens inside `factory.md` are runtime values the agent fills (slug, criteria, URL) — these are intentional prompt slots, not plan placeholders; every shell command and file is concrete.

**Type/consistency:** every `bun run factory <sub>` referenced in `factory.md` exists in `src/factory.ts` (lock-acquire/release/check, classify, run-create/append/finalize, cap-check, stuck-check); `set-status` transitions (`queued→building→built|parked|needs_human`, `building→queued` on abort) are all in `ALLOWED_TRANSITIONS`; `MAX_BUDGET_USD`/`SKIP_DEDUPE` consumed in `run-trigger.sh` (Task 1) are exactly what `start-factory.sh` (Task 2) sets.

## Out of scope (this plan)

- `signal_strength` decrement on stuck (deferred — needs a small `ideas adjust-signal` CLI).
- Concurrent builds (lock = 1).
- Auto-graduation / auto-merge of built repos.
- The budget-estimator agent.
- Per-idea-kind template selection.
