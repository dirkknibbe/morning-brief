#!/bin/bash
# loop-triggers.sh — daily driver for morning-brief and action-research.
#
# Designed to run inside tmux on a machine that stays on. Fires the
# brief at 06:30 local, then action-research at 07:00 local, then
# sleeps until the next day.
#
# Usage:
#   tmux new -d -s morning-brief 'cd ~/morning-brief && ./scripts/loop-triggers.sh'
#   tmux attach -t morning-brief   # to watch
#   tmux kill-session -t morning-brief   # to stop
#
# Stdout is already captured inside each trigger's log file; this
# script just prints a wall-clock heartbeat so you can see it's alive.

set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

BRIEF_HOUR=6
BRIEF_MIN=30
ACTION_HOUR=7
ACTION_MIN=0

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# Compute the epoch-seconds timestamp of today's HH:MM. If it's already
# passed, returns tomorrow's instead.
future_epoch() {
  local hour="$1" min="$2"
  local today tomorrow target_today target_tomorrow now
  today="$(date '+%Y-%m-%d')"
  tomorrow="$(date -v+1d '+%Y-%m-%d')"
  target_today=$(date -j -f '%Y-%m-%d %H:%M' "$today $hour:$min" '+%s')
  target_tomorrow=$(date -j -f '%Y-%m-%d %H:%M' "$tomorrow $hour:$min" '+%s')
  now=$(date '+%s')
  if [ "$now" -lt "$target_today" ]; then
    echo "$target_today"
  else
    echo "$target_tomorrow"
  fi
}

sleep_until() {
  local target="$1" label="$2" now diff
  now=$(date '+%s')
  diff=$((target - now))
  if [ "$diff" -gt 0 ]; then
    log "sleeping ${diff}s until $label ($(date -r "$target" '+%Y-%m-%d %H:%M:%S'))"
    sleep "$diff"
  fi
}

fire() {
  local trigger_file="$1" label="$2"
  log "firing $label"
  ./scripts/run-trigger.sh "$trigger_file" < /dev/null
  local rc=$?
  log "$label exited $rc"
}

log "loop-triggers started (brief $(printf '%02d:%02d' $BRIEF_HOUR $BRIEF_MIN), action $(printf '%02d:%02d' $ACTION_HOUR $ACTION_MIN) local)"

while true; do
  brief_at=$(future_epoch "$BRIEF_HOUR" "$BRIEF_MIN")
  sleep_until "$brief_at" "brief"
  fire "triggers/scheduled-brief.md" "brief"

  action_at=$(future_epoch "$ACTION_HOUR" "$ACTION_MIN")
  sleep_until "$action_at" "action-research"
  fire "triggers/action-research.md" "action-research"

  log "cycle complete, looping"
done
