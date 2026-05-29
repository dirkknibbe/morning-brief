# Loop Daemon Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five per-stage launchd plists with a single `loop-triggers.sh` daemon that runs the whole pipeline in dependency order.

**Architecture:** `scripts/loop-triggers.sh` already sequences brief → action-research → extract → synthesize → triage with `system-state` gating, in a `while true` + `sleep_until` loop designed to run continuously. Today it isn't running anywhere; the daily cadence is instead provided by five independent `StartCalendarInterval` plists fired at fixed minutes (06:00/06:06/06:12/06:20/06:30). That works but is **time-spaced, not dependency-ordered**: if the brief runs long one morning, action-research starts before it finishes. Migrating to one launchd daemon that runs `loop-triggers.sh` under `KeepAlive` gives true sequential ordering (each stage is a blocking call in a bash script), a single gating point, one job to manage, and automatic restart on crash/reboot.

**Tech Stack:** macOS launchd (`launchctl bootstrap`/`bootout`/`print`), bash, bun, MongoDB (`system-state` gate), the existing `run-trigger.sh` / `run-extract.sh` runners.

---

## Why this is deferred, not urgent

The per-stage plists (shipped 2026-05-29) already deliver the full pipeline daily with `RunAtLoad=true` + a 21h dedupe guard, so missed-fire recovery and double-fire protection are handled. The daemon is a **robustness/clarity upgrade**, not a bug fix. Do it when there's appetite, not under pressure.

## Current state (as of 2026-05-29)

Installed in `~/Library/LaunchAgents/` (templates in `scripts/launchd/`):

| Label | Runner | Schedule | Guard |
|-------|--------|----------|-------|
| `…scheduled-brief` | `run-trigger.sh triggers/scheduled-brief.md` | 06:00 | 21h (in run-trigger.sh) |
| `…action-research` | `run-trigger.sh triggers/action-research.md` | 06:06 | 21h |
| `…extract` | `run-extract.sh` | 06:12 | 21h (in run-extract.sh) |
| `…synthesize` | `run-trigger.sh triggers/synthesize.md` | 06:20 | 21h |
| `…triage` | `run-trigger.sh triggers/triage.md` | 06:30 | 21h |

All five are `RunAtLoad=true`. Guards key off `/tmp/morning-brief-<stem>-last-run`.

## Known reconciliations before migrating

1. **Schedule drift.** `loop-triggers.sh` hardcodes `BRIEF_HOUR=6 BRIEF_MIN=30`, `ACTION_HOUR=7 ACTION_MIN=0` — i.e. brief at 06:30, action at 07:00. The installed plists use 06:00 / 06:06. Decide the canonical schedule and make `loop-triggers.sh` match before cutover (Task 2).
2. **`.env` sourcing.** `loop-triggers.sh` calls `bun run system-state …` and `bun run extract-ideas` **directly** (not via a runner), so it needs `MONGODB_URI` in its own environment. Confirm it sources `.env` (or add it) — launchd gives a minimal env (Task 3).
3. **Extract runner.** `loop-triggers.sh` currently calls bare `bun run extract-ideas`; switch it to `./scripts/run-extract.sh` so extract gets the same guard + logging as every other stage (Task 4).

---

## File Structure

- Modify: `scripts/loop-triggers.sh` — schedule constants, `.env` sourcing, extract via runner.
- Create: `scripts/launchd/com.dirkknibbe.morning-brief.loop.plist` — the daemon plist (KeepAlive).
- Delete: the five per-stage templates in `scripts/launchd/` after cutover.
- Manual (not version-controlled): install the loop plist + bootout the five per-stage plists in `~/Library/LaunchAgents/`.

---

### Task 1: Capture current behavior as a baseline

**Files:** none (observation only)

- [ ] **Step 1: Record the installed jobs and their schedules**

Run:
```bash
launchctl list | grep morning-brief
for L in scheduled-brief action-research extract synthesize triage; do
  /usr/libexec/PlistBuddy -c "Print :StartCalendarInterval" \
    ~/Library/LaunchAgents/com.dirkknibbe.morning-brief.$L.plist 2>/dev/null
done
```
Expected: five labels listed; the schedule minutes match the table above. Save this output in the migration PR description as the rollback reference.

- [ ] **Step 2: Read loop-triggers.sh end to end**

Run: `cat scripts/loop-triggers.sh`
Confirm the stage order is brief → action → extract → synthesize → triage, each gated by `system-state not-frozen` / `system-state check <stage>`, and note the exact `BRIEF_HOUR/MIN` / `ACTION_HOUR/MIN` values.

---

### Task 2: Reconcile the daemon's schedule to 06:00 / 06:06

**Files:**
- Modify: `scripts/loop-triggers.sh` (the `BRIEF_*` / `ACTION_*` constants, near the top)

- [ ] **Step 1: Set the constants to match the current installed cadence**

Change:
```bash
BRIEF_HOUR=6
BRIEF_MIN=30
ACTION_HOUR=7
ACTION_MIN=0
```
to:
```bash
BRIEF_HOUR=6
BRIEF_MIN=0
ACTION_HOUR=6
ACTION_MIN=6
```

(Keep the post-action stages — extract/synthesize/triage — running back-to-back immediately after action-research, as the script already does. The daemon runs them in sequence with no fixed minute, which is the whole point.)

- [ ] **Step 2: Syntax-check the script**

Run: `bash -n scripts/loop-triggers.sh`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/loop-triggers.sh
git commit -m "fix(loop): align loop-triggers schedule to 06:00 brief / 06:06 action"
```

---

### Task 3: Ensure loop-triggers.sh sources .env and has a usable PATH

**Files:**
- Modify: `scripts/loop-triggers.sh` (top of file, after the shebang/comments, before the first `bun run`)

- [ ] **Step 1: Confirm whether it already sources .env**

Run: `grep -n '\.env\|MONGODB_URI\|export PATH' scripts/loop-triggers.sh`
If it already sources `.env` and sets PATH, skip to Task 4. Otherwise continue.

- [ ] **Step 2: Add env sourcing + PATH near the top (mirrors run-trigger.sh)**

Insert after the `cd` into the repo root:
```bash
# launchd gives a minimal environment; load .env and Dirk's tool paths so the
# direct `bun run system-state` / `bun run extract-ideas` calls below work.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
```

- [ ] **Step 3: Syntax-check and commit**

```bash
bash -n scripts/loop-triggers.sh
git add scripts/loop-triggers.sh
git commit -m "fix(loop): source .env + set PATH in loop-triggers for launchd"
```

---

### Task 4: Route extract through run-extract.sh inside the loop

**Files:**
- Modify: `scripts/loop-triggers.sh` (the extract stage block)

- [ ] **Step 1: Replace the bare extract call**

Find the extract block (it calls `bun run extract-ideas`) and change the command from:
```bash
    if bun run extract-ideas; then
```
to:
```bash
    if ./scripts/run-extract.sh; then
```
This gives extract the same 21h guard + per-day log file as the other stages. Leave the surrounding `system-state check extract` gate intact.

- [ ] **Step 2: Syntax-check and commit**

```bash
bash -n scripts/loop-triggers.sh
git add scripts/loop-triggers.sh
git commit -m "fix(loop): run extract via run-extract.sh wrapper inside the daemon"
```

---

### Task 5: Author the daemon plist

**Files:**
- Create: `scripts/launchd/com.dirkknibbe.morning-brief.loop.plist`

- [ ] **Step 1: Write the plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dirkknibbe.morning-brief.loop</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/dirkknibbe/morning-brief/scripts/loop-triggers.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/dirkknibbe/morning-brief</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/dirkknibbe/morning-brief/logs/launchd-loop.out</string>
    <key>StandardErrorPath</key>
    <string>/Users/dirkknibbe/morning-brief/logs/launchd-loop.err</string>
</dict>
</plist>
```

`KeepAlive=true` restarts the daemon if it exits or the Mac reboots. The script's own `while true` + `sleep_until` provides the daily cadence; the 21h guards prevent a restart from re-running a stage that already ran today.

- [ ] **Step 2: Commit**

```bash
git add scripts/launchd/com.dirkknibbe.morning-brief.loop.plist
git commit -m "feat(loop): add loop-triggers daemon plist (KeepAlive)"
```

---

### Task 6: Dry-run the daemon logic once, by hand, before cutover

**Files:** none (validation)

- [ ] **Step 1: Pre-touch all guards so a manual run skips the heavy stages**

Run:
```bash
for s in scheduled-brief action-research extract synthesize triage; do
  touch /tmp/morning-brief-$s-last-run
done
```

- [ ] **Step 2: Run one iteration with a short-circuit**

The daemon loops forever, so don't run it raw. Instead confirm the script reaches the stage dispatch and the guards short-circuit. Run with a 30s cap:
```bash
( cd /Users/dirkknibbe/morning-brief && timeout 30 ./scripts/loop-triggers.sh ) ; echo "exit=$?"
```
(`timeout` is GNU; on macOS use `gtimeout` from coreutils, or background the process and `kill` it after 30s.)
Expected: log lines showing it computed the next `sleep_until` target, OR that it fired stages which then logged "skipping (< 21h)". No new brief/synthesis/triage work performed (guards fresh). Confirm via:
```bash
tail -5 logs/launchd-loop.err 2>/dev/null; grep -c 'skipping' logs/*-$(date +%F).log
```

---

### Task 7: Cutover — bootout the five per-stage jobs, bootstrap the daemon

**Files:** none (launchd state)

- [ ] **Step 1: Bootout the five per-stage jobs**

```bash
for L in scheduled-brief action-research extract synthesize triage; do
  launchctl bootout gui/$UID/com.dirkknibbe.morning-brief.$L 2>&1
done
launchctl list | grep morning-brief
```
Expected: none of the five remain listed.

- [ ] **Step 2: Install + bootstrap the daemon**

```bash
cp scripts/launchd/com.dirkknibbe.morning-brief.loop.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.dirkknibbe.morning-brief.loop.plist
launchctl print gui/$UID/com.dirkknibbe.morning-brief.loop | grep -E 'state|pid'
```
Expected: `state = running`, a live `pid`. The daemon is now sleeping until the next 06:00.

- [ ] **Step 3: Confirm it survives a restart (KeepAlive)**

```bash
PID=$(launchctl print gui/$UID/com.dirkknibbe.morning-brief.loop | awk '/pid =/{print $3}')
kill "$PID"
sleep 3
launchctl print gui/$UID/com.dirkknibbe.morning-brief.loop | grep -E 'state|pid'
```
Expected: a NEW pid (launchd restarted it).

---

### Task 8: Remove the now-dead per-stage templates

**Files:**
- Delete: `scripts/launchd/com.dirkknibbe.morning-brief.{scheduled-brief,action-research,extract,synthesize,triage}.plist`

- [ ] **Step 1: Delete and commit**

```bash
git rm scripts/launchd/com.dirkknibbe.morning-brief.scheduled-brief.plist \
       scripts/launchd/com.dirkknibbe.morning-brief.action-research.plist \
       scripts/launchd/com.dirkknibbe.morning-brief.extract.plist \
       scripts/launchd/com.dirkknibbe.morning-brief.synthesize.plist \
       scripts/launchd/com.dirkknibbe.morning-brief.triage.plist
git commit -m "chore(loop): drop per-stage launchd templates (superseded by loop daemon)"
```

- [ ] **Step 2: Note the manual cleanup**

The five plists still exist in `~/Library/LaunchAgents/` on the machine (booted out, so inert, but the files remain). Optionally `rm` them so a future blanket `launchctl bootstrap` of that directory doesn't re-load them:
```bash
for L in scheduled-brief action-research extract synthesize triage; do
  rm -f ~/Library/LaunchAgents/com.dirkknibbe.morning-brief.$L.plist
done
```

---

### Task 9: Observe the first real daemon-driven morning

**Files:** none (verification)

- [ ] **Step 1: The morning after cutover, confirm the full chain ran in order**

```bash
grep -E 'starting|finished|skipping' logs/launchd-loop.err logs/*-$(date +%F).log | sort
```
Expected: brief → action-research → extract → synthesize → triage, each `starting` strictly after the prior `finished`, and a Telegram digest delivered. This is the proof the daemon orders stages correctly (the property the per-stage plists couldn't guarantee).

---

## Rollback

If the daemon misbehaves:
```bash
launchctl bootout gui/$UID/com.dirkknibbe.morning-brief.loop
git checkout <pre-migration-sha> -- scripts/launchd/
for L in scheduled-brief action-research extract synthesize triage; do
  cp scripts/launchd/com.dirkknibbe.morning-brief.$L.plist ~/Library/LaunchAgents/
  launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.dirkknibbe.morning-brief.$L.plist
done
```
The five per-stage plists are the known-good fallback; keep the pre-migration SHA handy (recorded in Task 1).

---

## Self-review notes

- **Schedule reconciliation (Task 2)** is the one behavior change — without it, migrating silently shifts the brief from 06:00 to 06:30. Flagged explicitly.
- **`.env` sourcing (Task 3)** is the most likely failure mode: `loop-triggers.sh` calls `bun run system-state` directly, which dies without `MONGODB_URI`. If the script already sources `.env`, Task 3 is a no-op (Step 1 checks).
- **Guard interaction:** the 21h guards live in `run-trigger.sh` / `run-extract.sh`, which the daemon calls — so a `KeepAlive` restart mid-day cannot double-run a completed stage. Verified by Task 6.
- **Not version-controlling the live plists** matches existing convention; templates in `scripts/launchd/` are the source of truth, installed by copy.
