import { test, expect } from "bun:test";
import {
  expectedFactoryWorktree,
  assertInFactoryWorktree,
  WrongWorktreeError,
} from "../factory-guard";

test("expectedFactoryWorktree: composes repoRoot/.claude/worktrees/factory/<slug>", () => {
  expect(expectedFactoryWorktree("mcp-auth", "/repo")).toBe(
    "/repo/.claude/worktrees/factory/mcp-auth",
  );
  expect(expectedFactoryWorktree("agent-spend", "/Users/x/morning-brief")).toBe(
    "/Users/x/morning-brief/.claude/worktrees/factory/agent-spend",
  );
});

test("assertInFactoryWorktree: silent when cwd matches expected path", () => {
  const slug = "mcp-auth";
  const repoRoot = "/repo";
  const cwd = "/repo/.claude/worktrees/factory/mcp-auth";
  expect(() => assertInFactoryWorktree(slug, repoRoot, cwd)).not.toThrow();
});

test("assertInFactoryWorktree: throws WrongWorktreeError when cwd is repo root (not in factory worktree)", () => {
  expect(() => assertInFactoryWorktree("mcp-auth", "/repo", "/repo")).toThrow(WrongWorktreeError);
});

test("assertInFactoryWorktree: throws when cwd is a different idea's worktree", () => {
  expect(() =>
    assertInFactoryWorktree(
      "mcp-auth",
      "/repo",
      "/repo/.claude/worktrees/factory/different-idea",
    ),
  ).toThrow(WrongWorktreeError);
});

test("WrongWorktreeError carries expected and actual paths", () => {
  try {
    assertInFactoryWorktree("mcp-auth", "/repo", "/somewhere/else");
    throw new Error("should have thrown");
  } catch (e: any) {
    expect(e).toBeInstanceOf(WrongWorktreeError);
    expect(e.expected).toBe("/repo/.claude/worktrees/factory/mcp-auth");
    expect(e.actual).toBe("/somewhere/else");
    expect(e.message).toContain("mcp-auth");
    expect(e.message).toContain("/somewhere/else");
  }
});

test("assertInFactoryWorktree: normalizes trailing slash on cwd", () => {
  // Trailing slash on cwd should not cause a false mismatch.
  expect(() =>
    assertInFactoryWorktree("mcp-auth", "/repo", "/repo/.claude/worktrees/factory/mcp-auth/"),
  ).not.toThrow();
});
