#!/usr/bin/env bash
# install-hooks.sh — idempotently install repo-level git hooks.
#
# Symlinks scripts/hooks/pre-push into $(git rev-parse --git-common-dir)/hooks/pre-push
# so the hook lives in the source tree (version-controlled) but git finds it
# at hook-execution time.
#
# Using --git-common-dir means this works correctly whether you're in the main
# checkout or a worktree — both share the same hooks directory.
#
# Usage: bash scripts/install-hooks.sh   (run once per clone)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GIT_COMMON_DIR="$(git -C "$REPO_DIR" rev-parse --git-common-dir)"
# git-common-dir may be a relative path; resolve to absolute.
case "$GIT_COMMON_DIR" in
  /*) ;;
  *) GIT_COMMON_DIR="$REPO_DIR/$GIT_COMMON_DIR" ;;
esac

HOOKS_SRC="$REPO_DIR/scripts/hooks"
HOOKS_DST="$GIT_COMMON_DIR/hooks"

mkdir -p "$HOOKS_DST"

# Ensure the source hook is executable so the symlink target is runnable.
chmod +x "$HOOKS_SRC/pre-push"

# Idempotent symlink install.
TARGET="$HOOKS_DST/pre-push"
if [ -L "$TARGET" ] && [ "$(readlink "$TARGET")" = "$HOOKS_SRC/pre-push" ]; then
  echo "· pre-push hook already installed at $TARGET"
else
  if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
    echo "pre-push hook already exists at $TARGET and is not a symlink we manage." >&2
    echo "Move it aside (e.g., mv $TARGET $TARGET.bak) and re-run." >&2
    exit 1
  fi
  ln -sfn "$HOOKS_SRC/pre-push" "$TARGET"
  echo "✓ installed pre-push hook: $TARGET → $HOOKS_SRC/pre-push"
fi
