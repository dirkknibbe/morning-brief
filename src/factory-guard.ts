/**
 * factory-guard.ts — worktree boundary assertion for the factory.
 *
 * Pure path comparison. The factory must operate inside its assigned
 * worktree (`<repoRoot>/.claude/worktrees/factory/<slug>`) — any other
 * cwd indicates a bug or misconfiguration and aborts the run.
 *
 * Pure functions. No I/O. Caller supplies repoRoot and (optionally) cwd.
 * Symlink resolution is the caller's responsibility — pass an already
 * resolved path if the worktree may sit behind a symlink.
 */
import { join } from "node:path";

export class WrongWorktreeError extends Error {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
    public readonly ideaSlug: string,
  ) {
    super(
      `Factory must run in ${expected} for idea "${ideaSlug}", but cwd is ${actual}.`,
    );
    this.name = "WrongWorktreeError";
  }
}

export function expectedFactoryWorktree(ideaSlug: string, repoRoot: string): string {
  return join(repoRoot, ".claude", "worktrees", "factory", ideaSlug);
}

function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

export function assertInFactoryWorktree(
  ideaSlug: string,
  repoRoot: string,
  cwd: string = process.cwd(),
): void {
  const expected = expectedFactoryWorktree(ideaSlug, repoRoot);
  const actual = stripTrailingSlash(cwd);
  const expectedClean = stripTrailingSlash(expected);
  if (actual !== expectedClean) {
    throw new WrongWorktreeError(expectedClean, actual, ideaSlug);
  }
}

export class WrongBuildDirError extends Error {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
    public readonly ideaSlug: string,
  ) {
    super(`Factory must run in ${expected} for idea "${ideaSlug}", but cwd is ${actual}.`);
    this.name = "WrongBuildDirError";
  }
}

export function expectedBuildDir(ideaSlug: string, repoRoot: string): string {
  return join(repoRoot, ".claude", "builds", ideaSlug);
}

export function assertInBuildDir(
  ideaSlug: string,
  repoRoot: string,
  cwd: string = process.cwd(),
): void {
  const expected = stripTrailingSlash(expectedBuildDir(ideaSlug, repoRoot));
  const actual = stripTrailingSlash(cwd);
  if (actual !== expected) {
    throw new WrongBuildDirError(expected, actual, ideaSlug);
  }
}
