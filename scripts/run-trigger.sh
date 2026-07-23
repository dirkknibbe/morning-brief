#!/bin/bash
# run-trigger.sh — headless runner for morning-brief triggers.
#
# Usage: run-trigger.sh <trigger-file>
#   e.g. run-trigger.sh triggers/scheduled-brief.md
#
# Designed to be called from launchd or scripts/start-factory.sh. Sources the
# repo's .env so TELEGRAM_*, MONGODB_URI, GITHUB_TOKEN etc. land in the Claude
# Code session. Logs stdout+stderr to logs/<trigger-stem>-<date>.log.
# Exits non-zero when the run fails — including API connection errors that
# `claude --print` itself exits 0 on.
#
# Env knobs (both backward-compatible, default to the daily behavior):
#   SKIP_DEDUPE=1     bypass the 21h dedupe guard (on-demand runs, e.g. factory)
#   MAX_BUDGET_USD=N  override the per-run claude budget (default 5; factory 20)

set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

TRIGGER="${1:-}"
if [ -z "$TRIGGER" ] || [ ! -f "$TRIGGER" ]; then
  echo "usage: $0 <trigger-file>" >&2
  exit 2
fi

STEM="$(basename "$TRIGGER" .md)"

# Daily dedupe guard — prevents RunAtLoad/login re-fires from re-running a
# trigger that already ran today. Skipped for on-demand runs (the factory) via
# SKIP_DEDUPE=1; the factory_lock already enforces one-at-a-time there. 21h
# (75600s) < 24h so consecutive daily 06:xx runs aren't blocked.
# The marker is touched up front so a re-fire mid-run is still blocked, and
# removed again after a failed run so failures don't block same-day retries.
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

# Load .env if present. Allow KEY="value" and KEY=value.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# launchd starts with a minimal PATH. Add the spots Dirk's tools live.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p logs
DATE="$(date +%Y-%m-%d)"
LOG="logs/${STEM}-${DATE}.log"

RUN_OUT="$(mktemp "${TMPDIR:-/tmp}/morning-brief-${STEM}-out.XXXXXX")"
trap 'rm -f "$RUN_OUT"' EXIT

{
  echo "=== $(date -Iseconds) starting $STEM ==="
  echo "cwd=$PWD"
  echo "trigger=$TRIGGER"

  # Claude Code headless: pass the trigger file contents as the user prompt,
  # bypass permissions so it can run tools without prompting, and cap cost.
  # tee streams the log live while capturing output for the failure check.
  claude \
    --print \
    --permission-mode bypassPermissions \
    --max-budget-usd "${MAX_BUDGET_USD:-5}" \
    "$(cat "$TRIGGER")" \
    </dev/null 2>&1 | tee "$RUN_OUT"
  STATUS="${PIPESTATUS[0]}"

  # claude --print exits 0 even when the API is unreachable (ConnectionRefused,
  # socket closed mid-run) — the only failure signal is an "API Error:" line
  # in its output.
  if [ "$STATUS" -eq 0 ] && grep -q '^API Error:' "$RUN_OUT"; then
    STATUS=1
  fi

  # Failed runs don't count toward the 21h dedupe. LAST_RUN is unset when
  # SKIP_DEDUPE=1, so on-demand runs never touch the marker.
  if [ "$STATUS" -ne 0 ] && [ -n "${LAST_RUN:-}" ]; then
    echo "run failed; clearing dedupe marker so a retry isn't blocked"
    rm -f "$LAST_RUN"
  fi

  echo "=== $(date -Iseconds) finished $STEM (exit $STATUS) ==="
  exit "$STATUS"
} >>"$LOG" 2>&1
