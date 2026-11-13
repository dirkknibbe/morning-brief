#!/bin/bash
# run-pipeline.sh — hourly runner for the 5 daily stages (replaces 5 fixed-time launchd jobs).
#
# Why hourly: a fixed-time job is lost if the Mac is asleep/off at that moment. An hourly
# tick (06:00-17:xx local) retries until each stage has succeeded once today.
# Why the 17:00 cutoff: Claude labels the brief with the UTC date, so after 18:00 CST a
# run would be dated tomorrow. The 17:xx tick also sends one "incomplete" alert.
# Why logs/.done and not /tmp: /tmp is wiped on reboot, which would re-run finished stages.
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
  if [ -f "$marker" ]; then
    log "skipped $stem (done)"
    continue
  fi
  if run_stage "$stem"; then
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
