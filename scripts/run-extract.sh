#!/bin/bash
# run-extract.sh — headless runner for the non-LLM extract-ideas stage.
#
# extract-ideas is a plain bun script (no Claude headless call), so it can't
# ride run-trigger.sh. This mirrors run-trigger.sh's env handling + 21h dedupe
# guard so launchd can schedule it and RunAtLoad re-fires don't redo a run
# that already happened today.

set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

STEM="extract"

# Time-based dedupe: skip if extract ran within the last 21 hours (mirrors
# run-trigger.sh). 21h < 24h so consecutive daily 06:xx runs aren't blocked,
# but a RunAtLoad/login re-fire on the same day is.
LAST_RUN="/tmp/morning-brief-${STEM}-last-run"
if [ -f "$LAST_RUN" ]; then
  AGE=$(( $(date +%s) - $(stat -f %m "$LAST_RUN") ))
  if [ "$AGE" -lt 75600 ]; then
    echo "$(date -Iseconds) extract ran ${AGE}s ago (< 21h), skipping" >&2
    exit 0
  fi
fi
touch "$LAST_RUN"

# Load .env (KEY=value and KEY="value" both work).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# launchd starts with a minimal PATH; add where Dirk's tools live.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p logs
LOG="logs/extract-$(date +%Y-%m-%d).log"

{
  echo "=== $(date -Iseconds) starting extract ==="
  echo "cwd=$PWD"
  bun run extract-ideas
  echo "=== $(date -Iseconds) finished extract (exit $?) ==="
} >>"$LOG" 2>&1
