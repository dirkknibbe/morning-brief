#!/bin/bash
# run-listener.sh — launchd wrapper for the Discord listener daemon.
#
# Same env convention as run-trigger.sh: source the repo's .env (set -a) so
# DISCORD_* and MONGODB_* reach the daemon AND its shell-outs
# (start-factory.sh needs bun/gh/perl on PATH — launchd starts minimal).
# The daemon does its own per-day logging (logs/listener-<date>.log) and
# mirrors to stdout, which launchd captures in logs/launchd-listener.out.
set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

# Load .env if present. Allow KEY="value" and KEY=value.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# launchd starts with a minimal PATH. Add the spots Dirk's tools live.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

exec bun run scripts/discord-listener.ts "$@"
