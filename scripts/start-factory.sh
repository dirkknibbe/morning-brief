#!/bin/bash
# start-factory.sh — launch a factory build for one queued idea as a detached
# process group. Called by the Telegram listener on `/build <slug>`.
#
# Pre-flight checks only; the factory trigger (triggers/factory.md) acquires
# the Mongo lock itself and records its own pgid, which /abort uses to kill
# the group.
#
# macOS has no `setsid`, so we create the new session+process group via perl's
# POSIX::setsid (ships with macOS). The exec'd process becomes the group
# leader; a single `kill -- -<pgid>` later stops the whole tree (claude + bun).
set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

SLUG="${1:-}"
if [ -z "$SLUG" ]; then
  echo "usage: start-factory.sh <slug>" >&2
  exit 2
fi

[ -f .env ] || { echo "start-factory: .env missing" >&2; exit 1; }
command -v bun  >/dev/null 2>&1 || { echo "start-factory: bun not found on PATH" >&2; exit 1; }
command -v gh   >/dev/null 2>&1 || { echo "start-factory: gh not found on PATH" >&2; exit 1; }
command -v perl >/dev/null 2>&1 || { echo "start-factory: perl not found (needed to detach the process group)" >&2; exit 1; }

# Fast-fail if a build is already running. Authoritative gate is the lock the
# trigger acquires; this is a UX nicety so the listener can reply immediately.
LOCK="$(bun run factory lock-check 2>/dev/null)"
if [ -n "$LOCK" ] && [ "$LOCK" != "null" ]; then
  echo "start-factory: a build is already running: $LOCK" >&2
  exit 3
fi

mkdir -p logs
LOG="logs/factory-${SLUG}-$(date +%Y-%m-%d).log"

# Detach into a new session+process group (perl POSIX::setsid; macOS has no
# setsid). The exec'd group leader's pid becomes the pgid the factory records
# in the lock, so /abort can `kill -- -<pgid>` the whole tree.
perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec: $!"' -- \
  /usr/bin/env IDEA_SLUG="$SLUG" SKIP_DEDUPE=1 MAX_BUDGET_USD=20 \
  ./scripts/run-trigger.sh triggers/factory.md >>"$LOG" 2>&1 &

echo "started factory for $SLUG (log: $LOG)"
