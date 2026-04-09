import { describe, expect, test } from "bun:test";
import { splitMessage } from "../telegram.ts";

describe("splitMessage", () => {
  test("returns single chunk when under limit", () => {
    expect(splitMessage("hello", 100)).toEqual(["hello"]);
  });

  test("splits at newline boundary when possible", () => {
    const text = "a".repeat(50) + "\n" + "b".repeat(50);
    const chunks = splitMessage(text, 60);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe("a".repeat(50));
    expect(chunks[1]).toBe("b".repeat(50));
  });

  test("splits at space when no newline near limit", () => {
    const text = "word ".repeat(30).trim();
    const chunks = splitMessage(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(50);
  });

  test("hard-splits when no whitespace found", () => {
    const text = "x".repeat(200);
    const chunks = splitMessage(text, 50);
    expect(chunks.length).toBe(4);
    expect(chunks.every((c) => c.length <= 50)).toBe(true);
  });
});
