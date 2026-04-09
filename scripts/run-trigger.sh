#!/bin/bash
# run-trigger.sh — headless runner for morning-brief triggers.
#
# Usage: run-trigger.sh <trigger-file>
#   e.g. run-trigger.sh triggers/scheduled-brief.md
#
# Designed to be called from launchd. Sources the repo's .env so
# TELEGRAM_*, MONGODB_URI, GITHUB_TOKEN etc. land in the Claude Code
# session. Logs stdout+stderr to logs/<trigger-stem>-<date>.log so you
# can read what happened after the fact.

set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

TRIGGER="${1:-}"
if [ -z "$TRIGGER" ] || [ ! -f "$TRIGGER" ]; then
  echo "usage: $0 <trigger-file>" >&2
  exit 2
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
STEM="$(basename "$TRIGGER" .md)"
DATE="$(date +%Y-%m-%d)"
LOG="logs/${STEM}-${DATE}.log"

{
  echo "=== $(date -Iseconds) starting $STEM ==="
  echo "cwd=$PWD"
  echo "trigger=$TRIGGER"

  # Claude Code headless: pass the trigger file contents as the user prompt,
  # bypass permissions so it can run tools without prompting, and cap cost.
  claude \
    --print \
    --permission-mode bypassPermissions \
    --max-budget-usd 5 \
    "$(cat "$TRIGGER")" \
    </dev/null

  echo "=== $(date -Iseconds) finished $STEM (exit $?) ==="
} >>"$LOG" 2>&1
