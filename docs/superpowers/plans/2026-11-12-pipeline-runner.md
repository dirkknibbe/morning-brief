# Hourly Pipeline Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One launchd job that runs the 5 daily stages in order, hourly 06:00–17:00, skipping stages already done today, so the pipeline self-heals after an outage.

**Architecture:** `scripts/run-pipeline.sh` loops over stages, calls the existing wrappers with `SKIP_DEDUPE=1`, records success as `logs/.done/<date>-<stem>`, stops at first failure, alerts once at 17:xx if incomplete. One plist replaces five.

**Tech Stack:** bash, launchd, bun test.

**Spec:** `docs/superpowers/specs/2026-11-12-pipeline-runner-design.md`

## Global Constraints

- Stage order, exactly: `scheduled-brief`, `action-research`, `extract`, `synthesize`, `triage`.
- Run window: local hour 06–17 inclusive. Outside it the runner exits 0 doing nothing.
- Fire times: 06:00, then 07:00 … 17:00 on the hour (12 entries).
- Done marker path: `logs/.done/<YYYY-MM-DD>-<stem>` (local date). Alert marker: `logs/.done/<YYYY-MM-DD>-alert`.
- Alert sent via `bun run send` (reads stdin). Failure to send is logged, not retried.
- Ground truth: `bun test` and `bunx tsc --noEmit`. No Claude co-author trailer on commits.
- Test stubs: never write a fresh executable (macOS first-run assessment is slow) — call stubs via `bash <file>` or symlink to system binaries.
- Work on branch `feat/hourly-pipeline-runner` off `origin/rehearsal` (main lacks `run-extract.sh` and 3 of the 5 stage plists — the deployed system is rehearsal). `rehearsal` is a merge target, never reset.

## Review Focus

1. Boot (`RunAtLoad`) at 05:30 or 20:00 → runner does nothing; no stage runs, no alert. (Task 2 test `outside window`.)
2. Two runs at 17:xx on the same incomplete day (17:00 fire + reboot at 17:40) → only one alert. (Task 2 test `alert once`.)
3. Brief fails, rest would succeed → no downstream stage runs that hour. (Task 2 test `stops at first failure`.)
4. Everything done at 06:00, hourly fires 07–17 → zero wrapper calls after the first run. (Task 2 test `skips done stages`.)
5. 17:xx run where everything finishes → no alert. (Task 2 test `no alert when complete`.)

---

### Task 1: `SKIP_DEDUPE` knob for `run-extract.sh`

**Files:**
- Modify: `scripts/run-extract.sh` (dedupe block, ~lines 15–27; failure-clear block ~lines 49–53)
- Test: `scripts/__tests__/run-extract.test.ts`

**Interfaces:**
- Produces: `SKIP_DEDUPE=1 bash scripts/run-extract.sh` runs regardless of marker age and never creates/removes the marker — same semantics as `run-trigger.sh`.

- [ ] **Step 1: Write the failing test** — extend `runWrapper(bunExit, env = {}, opts = {})` to merge `env` into the spawn env and to optionally pre-create the marker. Add:

```ts
test("SKIP_DEDUPE=1: runs and leaves no marker behind", async () => {
  const r = await runWrapper(0, { SKIP_DEDUPE: "1" }, { freshMarker: false });
  expect(r.code).toBe(0);
  expect(r.log).toContain("finished extract (exit 0)");
  expect(r.markerExists).toBe(false);
});

test("SKIP_DEDUPE=1: a fresh marker does not cause a skip", async () => {
  const r = await runWrapper(0, { SKIP_DEDUPE: "1" }, { freshMarker: true });
  expect(r.log).toContain("starting extract");
});
```

- [ ] **Step 2: Run** `bun test scripts/__tests__/run-extract.test.ts` — expect both new tests FAIL (marker created / run skipped).
- [ ] **Step 3: Implement** — wrap the dedupe block in `if [ "${SKIP_DEDUPE:-0}" != "1" ]; then … fi` and guard the failure `rm` with `[ -n "${LAST_RUN:-}" ]`, mirroring `scripts/run-trigger.sh:35-46,97-100` (set `LAST_RUN` only inside the guarded block). Update the header comment.
- [ ] **Step 4: Run** `bun test scripts/__tests__/run-extract.test.ts` — all 4 PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(loop): SKIP_DEDUPE knob for run-extract.sh"`

---

### Task 2: `scripts/run-pipeline.sh`

**Files:**
- Create: `scripts/run-pipeline.sh`
- Test: `scripts/__tests__/run-pipeline.test.ts`

**Interfaces:**
- Consumes: `SKIP_DEDUPE=1` on both wrappers (Task 1; `run-trigger.sh` already has it).
- Produces: `bash scripts/run-pipeline.sh` → exit 0 when all stages done or outside window, exit 1 when a stage failed this run. Env (test seams, defaults in parens): `PIPELINE_DATE` (`date +%Y-%m-%d`), `PIPELINE_HOUR` (`date +%H`, compare as base-10 — `08`/`09` must not be read as octal), `PIPELINE_SEND` (`bun run send`). Calls wrappers as `bash "$SCRIPT_DIR/run-trigger.sh" triggers/<stem>.md` and `bash "$SCRIPT_DIR/run-extract.sh"`. Logs to `logs/pipeline-<date>.log`.

- [ ] **Step 1: Write the failing tests.** Harness `runPipeline({ hour, failStage?, preDone?: string[], runs?: number })`:
  sandbox root with `scripts/run-pipeline.sh` (copied), stub `scripts/run-trigger.sh` and `scripts/run-extract.sh` as plain bash files that append their stem (`basename "$1" .md` or `extract`) to `$root/calls` and `exit 1` if it equals `$FAIL_STAGE`; `PIPELINE_DATE=2026-11-12`, `PIPELINE_SEND="tee -a $root/alerts"`; pre-create `logs/.done/2026-11-12-<s>` for each `preDone`. Returns `{ codes, calls: string[], alerts: string, done: string[] }`.

```ts
const ALL = ["scheduled-brief","action-research","extract","synthesize","triage"];
test("runs all stages in order and marks them done", …)       // hour 6 → calls == ALL, done has all 5, code 0
test("skips done stages", …)                                   // preDone ALL, hour 9 → calls == []
test("stops at first failure", …)                              // failStage "scheduled-brief" → calls == ["scheduled-brief"], code 1, no done markers
test("resumes from the failed stage next hour", …)             // preDone first 2, hour 14 → calls == ALL.slice(2)
test("outside window does nothing", …)                         // hour 5 and hour 18 → calls == [], alerts == "", code 0
test("hour 08 and 09 parse as base-10", …)                     // hour "08" → calls == ALL
test("alert once at 17 when incomplete", …)                    // failStage "extract", hour 17, runs 2 → alert names extract, synthesize, triage and 2026-11-12; appears exactly once
test("no alert when complete at 17", …)                        // hour 17 → alerts == ""
test("no alert before 17", …)                                  // failStage "extract", hour 16 → alerts == ""
```

- [ ] **Step 2: Run** `bun test scripts/__tests__/run-pipeline.test.ts` — all FAIL (file missing).
- [ ] **Step 3: Implement `scripts/run-pipeline.sh`.** Same preamble as `run-extract.sh` (`set -u`, cd to repo, PATH export; no `.env` sourcing — the wrappers do it). Flow: window check → `mkdir -p logs/.done` → for each stage: skip if marker, else run wrapper with `SKIP_DEDUPE=1`, touch marker on 0, on non-zero set `FAILED=1` and break → if hour is 17, any marker missing, and no alert marker: pipe a one-line message (`morning-brief: pipeline incomplete for <date>; missing: <stems>`) into `$PIPELINE_SEND`, touch the alert marker regardless of send result, log a line if send failed → exit `$FAILED`. Header comment: why hourly, why 17:00 (UTC date label), why `logs/.done` not `/tmp`.
- [ ] **Step 4: Run** `bun test scripts/__tests__/run-pipeline.test.ts` — 9 PASS; `bun test` — whole suite PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(loop): hourly pipeline runner with per-day done markers"`

---

### Task 3: Schedule — one plist replaces five, docs

**Files:**
- Create: `scripts/launchd/com.dirkknibbe.morning-brief.pipeline.plist`
- Delete: `scripts/launchd/com.dirkknibbe.morning-brief.{scheduled-brief,action-research,extract,synthesize,triage}.plist`
- Modify: any doc listing the per-stage plists (`grep -rln "morning-brief\.\(extract\|triage\|synthesize\|scheduled-brief\|action-research\)" README.md docs/ scripts/` — update live docs; leave dated historical specs/plans alone)

**Interfaces:**
- Consumes: `scripts/run-pipeline.sh` (Task 2).

- [ ] **Step 1: Write the plist** — same shape as the extract template: Label `com.dirkknibbe.morning-brief.pipeline`, ProgramArguments `/bin/bash /Users/dirkknibbe/morning-brief/scripts/run-pipeline.sh`, `RunAtLoad` true, `StartCalendarInterval` as an **array** of 12 `{Hour: N, Minute: 0}` dicts for N = 6…17, stdout/err to `logs/launchd-pipeline.{out,err}`.
- [ ] **Step 2: Verify** `plutil -lint scripts/launchd/com.dirkknibbe.morning-brief.pipeline.plist` → `OK`; `plutil -p … | grep -c '"Hour"'` → `12`.
- [ ] **Step 3: Delete the 5 stage templates** (`git rm`), update docs from the grep.
- [ ] **Step 4: Verify** `bun test` and `bunx tsc --noEmit` both clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(loop): single hourly launchd job replaces per-stage schedules"`

---

### Task 4: Ship and install (confirm with user before each step)

- [ ] **Step 1:** Push branch; fast-forward/merge into `rehearsal` (no reset) after user OK; user pulls into `~/morning-brief`.
- [ ] **Step 2: Pre-seed** `logs/.done/<today>-<stem>` in `~/morning-brief` for each stage whose log shows success today — otherwise `RunAtLoad` re-runs them.
- [ ] **Step 3 (changes live schedule):** for each of the 5 stage labels: `launchctl bootout gui/$(id -u)/com.dirkknibbe.morning-brief.<stem>` then `rm ~/Library/LaunchAgents/com.dirkknibbe.morning-brief.<stem>.plist`. Copy the pipeline plist in and `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dirkknibbe.morning-brief.pipeline.plist`.
- [ ] **Step 4: Verify** `launchctl print gui/$(id -u)/com.dirkknibbe.morning-brief.pipeline | grep -E "state|last exit"` and `tail logs/pipeline-<today>.log` shows all stages skipped as done.
- [ ] **Step 5:** Update memory `conventions.md` (scheduling = listener + pipeline plist, or tmux loop).
