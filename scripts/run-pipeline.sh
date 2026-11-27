#!/bin/bash
# run-pipeline.sh — hourly runner for the 5 daily stages (replaces 5 fixed-time launchd jobs).
#
# Why hourly: a fixed-time job is lost if the Mac is asleep/off at that moment. An hourly
# tick (06:00-17:xx local) retries until each stage has succeeded once today.
# Why the 17:00 cutoff: Claude labels the brief with the UTC date, so after 18:00 CST a
# run would be dated tomorrow. The 17:xx tick also sends one "incomplete" alert.
# Why logs/.done and not /tmp: /tmp is wiped on reboot, which would re-run finished stages.
#
# Why the brief stage is artifact-based: `claude --print` exits 0 even when the trigger failed
# in-session (e.g. Discord delivery), and the trigger archives briefs/<date>.md only after
# delivery. So for scheduled-brief, "done" = briefs/$DATE.md exists, not the exit code.
# (Local DATE equals Claude's UTC label for every hour in the 06-17 CST/CDT window.)
# ponytail: no per-stage timeout; a hung stage blocks the rest of the day (upgrade: gtimeout).
# ponytail: a first success at 17:5x can run downstream stages past 18:00 CST, the UTC date boundary.
#
# Env test seams: PIPELINE_DATE, PIPELINE_HOUR, PIPELINE_SEND (command that reads stdin).
# Exit: 0 = all done / outside window / nothing to do; 1 = a stage failed this run.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1

export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

DATE="${PIPELINE_DATE:-$(date +%Y-%m-%d)}"
HOUR=$((10#${PIPELINE_HOUR:-$(date +%H)})) # 10# so "08"/"09" aren't octal
SEND="${PIPELINE_SEND:-bun run send}"
STAGES="scheduled-brief action-research extract synthesize triage"

[ "$HOUR" -ge 6 ] && [ "$HOUR" -le 17 ] || exit 0

mkdir -p logs/.done
LOG="logs/pipeline-$DATE.log"
log() { echo "$(date -Iseconds) $*" >>"$LOG"; }

# Lock lives in /tmp so a reboot (power loss) clears it. ponytail: SIGKILL without reboot still leaves a stale lock; upgrade: PID check.
LOCK="${PIPELINE_LOCK:-/tmp/morning-brief-pipeline.lock}"
mkdir "$LOCK" 2>/dev/null || { log "another run in progress, exiting"; exit 0; }
trap 'rmdir "$LOCK"' EXIT

run_stage() {
  if [ "$1" = "extract" ]; then
    SKIP_DEDUPE=1 bash "$SCRIPT_DIR/run-extract.sh"
  else
    SKIP_DEDUPE=1 bash "$SCRIPT_DIR/run-trigger.sh" "triggers/$1.md"
  fi
}

FAILED=0
for stem in $STAGES; do
  marker="logs/.done/$DATE-$stem"
  if [ "$stem" = "scheduled-brief" ] && [ -f "briefs/$DATE.md" ]; then
    touch "$marker"
  fi
  if [ -f "$marker" ]; then
    log "skipped $stem (done)"
    continue
  fi
  run_stage "$stem"
  rc=$?
  if [ "$stem" = "scheduled-brief" ]; then
    [ -f "briefs/$DATE.md" ] && rc=0 || rc=1
  fi
  if [ "$rc" -eq 0 ]; then
    touch "$marker"
    log "ran $stem"
  else
    log "failed $stem"
    FAILED=1
    break
  fi
done

if [ "$HOUR" -eq 17 ]; then
  MISSING=""
  for stem in $STAGES; do
    [ -f "logs/.done/$DATE-$stem" ] || MISSING="$MISSING${MISSING:+, }$stem"
  done
  ALERT="logs/.done/$DATE-alert"
  if [ -n "$MISSING" ] && [ ! -f "$ALERT" ]; then
    touch "$ALERT" # marked regardless of send result: no retry, per spec
    if echo "morning-brief: pipeline incomplete for $DATE; missing: $MISSING" | bash -c "$SEND" >>"$LOG" 2>&1; then
      log "alert sent (missing: $MISSING)"
    else
      log "alert send failed (missing: $MISSING)"
    fi
  fi
fi

exit "$FAILED"
