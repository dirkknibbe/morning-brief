import { describe, test, expect } from "bun:test";
import { firstLine, formatElapsed } from "../discord/format";

describe("firstLine", () => {
  test("returns the first line of plain output", () => {
    expect(firstLine("error: boom\ndetail")).toBe("error: boom");
  });

  test("skips bun run's `$ …` banner line to reach the real error", () => {
    expect(
      firstLine("$ bun run src/factory.ts lock-check\nfactory: MONGODB_URI is not set")
    ).toBe("factory: MONGODB_URI is not set");
  });

  test("empty or banner-only output yields an empty string", () => {
    expect(firstLine("")).toBe("");
    expect(firstLine("$ bun run src/factory.ts lock-check\n")).toBe("");
  });
});

describe("formatElapsed", () => {
  test("seconds only under a minute", () => {
    expect(formatElapsed(42_000)).toBe("42s");
    expect(formatElapsed(0)).toBe("0s");
  });

  test("minutes and seconds under an hour", () => {
    expect(formatElapsed(2 * 60_000 + 14_000)).toBe("2m 14s");
  });

  test("hours and minutes from one hour up", () => {
    expect(formatElapsed(65 * 60_000)).toBe("1h 5m");
  });

  test("negative input clamps to zero", () => {
    expect(formatElapsed(-5_000)).toBe("0s");
  });
});
