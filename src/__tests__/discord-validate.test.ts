import { describe, test, expect } from "bun:test";
import {
  STALE_INTERACTION_CUTOFF_MS,
  isStaleInteraction,
  isValidSlug,
} from "../discord/validate";

describe("isValidSlug", () => {
  test("accepts lowercase letters, digits and hyphens", () => {
    expect(isValidSlug("my-idea-2")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("123")).toBe(true);
  });

  test("rejects the empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });

  test("rejects uppercase and whitespace", () => {
    expect(isValidSlug("My-Idea")).toBe(false);
    expect(isValidSlug("my idea")).toBe(false);
    expect(isValidSlug(" my-idea")).toBe(false);
    expect(isValidSlug("my-idea\n")).toBe(false);
  });

  test("rejects shell metacharacters (injection boundary)", () => {
    expect(isValidSlug("slug;rm -rf /")).toBe(false);
    expect(isValidSlug("slug$(whoami)")).toBe(false);
    expect(isValidSlug("slug`id`")).toBe(false);
    expect(isValidSlug("slug&&true")).toBe(false);
    expect(isValidSlug("../etc/passwd")).toBe(false);
    expect(isValidSlug("slug|cat")).toBe(false);
  });

  test("rejects underscores, dots and unicode", () => {
    expect(isValidSlug("my_idea")).toBe(false);
    expect(isValidSlug("my.idea")).toBe(false);
    expect(isValidSlug("idée")).toBe(false);
  });

  test("rejects non-strings", () => {
    expect(isValidSlug(null)).toBe(false);
    expect(isValidSlug(undefined)).toBe(false);
    expect(isValidSlug(42)).toBe(false);
  });
});

describe("isStaleInteraction", () => {
  const NOW = 1_750_000_000_000;

  test("fresh interaction is not stale", () => {
    expect(isStaleInteraction(NOW - 1_000, NOW)).toBe(false);
  });

  test("exactly at the cutoff is not stale (strict >)", () => {
    expect(isStaleInteraction(NOW - STALE_INTERACTION_CUTOFF_MS, NOW)).toBe(false);
  });

  test("one ms past the cutoff is stale", () => {
    expect(isStaleInteraction(NOW - STALE_INTERACTION_CUTOFF_MS - 1, NOW)).toBe(true);
  });

  test("cutoff is ~5 minutes", () => {
    expect(STALE_INTERACTION_CUTOFF_MS).toBe(5 * 60 * 1000);
  });
});
