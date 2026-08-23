import { describe, expect, test } from "bun:test";
import { parsePsTime, progressed, type Progress } from "../../scripts/factory-watchdog.ts";

describe("parsePsTime", () => {
  test("SS.ss / MM:SS / HH:MM:SS / D-HH:MM:SS", () => {
    expect(parsePsTime("0:00.12")).toBeCloseTo(0.12, 2);
    expect(parsePsTime("1:23")).toBe(83); // 1m23s
    expect(parsePsTime("12:34.56")).toBeCloseTo(754.56, 2); // 12m34.56s
    expect(parsePsTime("1:02:03")).toBe(3723); // 1h2m3s
    expect(parsePsTime("1-13:57:05")).toBe(86400 + 13 * 3600 + 57 * 60 + 5); // the 33h-run format
  });
  test("blank → 0", () => {
    expect(parsePsTime("")).toBe(0);
    expect(parsePsTime("   ")).toBe(0);
  });
});

describe("progressed", () => {
  const at = (cpuSeconds: number, head: string): Progress => ({ cpuSeconds, head });
  const THRESH = 5;

  test("CPU advanced past threshold → progress", () => {
    expect(progressed(at(100, "abc"), at(110, "abc"), THRESH)).toBe(true);
  });
  test("new commit (HEAD changed) → progress even with flat CPU", () => {
    expect(progressed(at(100, "abc"), at(100, "def"), THRESH)).toBe(true);
  });
  test("flat CPU + same HEAD → no progress (hung)", () => {
    expect(progressed(at(100, "abc"), at(100, "abc"), THRESH)).toBe(false);
  });
  test("tiny CPU wobble under threshold + same HEAD → no progress", () => {
    expect(progressed(at(100, "abc"), at(102, "abc"), THRESH)).toBe(false);
  });
  test("repo appearing (\"\" → hash) counts as progress", () => {
    expect(progressed(at(100, ""), at(100, "abc"), THRESH)).toBe(true);
  });
});
