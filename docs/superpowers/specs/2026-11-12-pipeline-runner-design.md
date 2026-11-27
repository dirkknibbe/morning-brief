# Hourly pipeline runner — design (short)

## Intent
Nov 7–11 the brief silently vanished: an internet outage killed every 06:00 run and
nothing retried. When the network comes back mid-day (e.g. 2pm), today's brief and
the rest of the pipeline should run then, labeled with today's date. (User decision.)

## Goals / non-goals / anti-goals
- Goal: the daily pipeline recovers on its own within an hour of the network returning, until 17:00.
- Goal: stages still run in order; a downstream stage never runs before its upstream succeeded today.
- Goal: a day that never recovers produces one Discord alert instead of silence.
- Non-goal: wait-for-network polling, the listener daemon, the factory, `loop-triggers.sh` (tmux path) — untouched.
- Anti-goal: a stage running twice on a good day, or a stage running on stale input
  (e.g. extract succeeding at 06:12 while the brief failed, then never picking up the 2pm brief).

## Approaches considered
- A. Hourly fire times on each of the 5 plists + "succeeded today" dedupe + per-stage upstream checks.
  Smallest diff, but ordering stays scattered across 5 files and clock spacing.
- B. A + wait-for-network preflight in wrappers. Faster recovery, but a waiting stage can overrun the
  next stage's slot and break ordering; more code.
- **C. One hourly runner (picked by user).** Ordering by construction, one schedule, launchd's
  one-instance-per-job rule prevents overlap.

## Design
- New `scripts/run-pipeline.sh`. Stages in order:
  `scheduled-brief → action-research → extract → synthesize → triage`.
  - For each stage: if `logs/.done/<YYYY-MM-DD>-<stem>` exists, skip. Otherwise run it via the existing
    wrapper (`run-trigger.sh triggers/<stem>.md`, `run-extract.sh`) with `SKIP_DEDUPE=1`.
  - Success → touch the done marker. Failure → stop the whole run (later stages wait for the next hour).
- `run-extract.sh` gains the same `SKIP_DEDUPE=1` knob `run-trigger.sh` already has.
- New plist `com.dirkknibbe.morning-brief.pipeline.plist`: `StartCalendarInterval` array at
  06:00 and every hour 07:00–17:00, `RunAtLoad` true (boot after a powered-off night catches up).
  The 5 per-stage plists are removed from `scripts/launchd/` and unloaded from `~/Library/LaunchAgents/`.
- 17:00 cutoff, enforced in the script too (a `RunAtLoad` fire after 17:00 does nothing): the brief's date
  label comes from Claude, which reads UTC, so runs after 18:00 CST mislabel to tomorrow.
- Alert: on the 17:00 run, if any stage still isn't done, send one Discord message
  (`printf ... | bun run send`) naming the missing stages. Send failure is logged, not retried.
- Test: `scripts/__tests__/run-pipeline.test.ts`, same style as `run-extract.test.ts` (stub wrappers,
  sandboxed done dir, fake clock via env) — covers skip-done, stop-on-failure, cutoff, alert-once.

## My calls (correct me)
- Done markers live in `logs/.done/`, not `/tmp`: `/tmp` is wiped on reboot, which would re-run a finished day.
- Old 21h dedupe stays in the wrappers for anything else that calls them; the runner bypasses it.
- No `system-state` gating added to the launchd path (it doesn't have any today). Ceiling: freeze only stops the tmux path.
- Alert can't reach Discord if the outage is still on at 17:00 — it lands in the log. Upgrade path: send a
  "missed yesterday" note on the next successful run.

## Left to the builder
Exact helper/variable names, how the test fakes the clock, log line wording.
