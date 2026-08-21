import { describe, expect, test } from "bun:test";
import { factoryStatusReply, formatElapsed } from "../discord/format.ts";

describe("formatElapsed", () => {
  test("seconds / minutes / hours", () => {
    expect(formatElapsed(42_000)).toBe("42s");
    expect(formatElapsed(74_000)).toBe("1m 14s");
    expect(formatElapsed(3_900_000)).toBe("1h 5m");
  });
});

describe("factoryStatusReply", () => {
  test("a held lock reports the slug and elapsed time", () => {
    const now = 1_000_000;
    const lock = { idea_slug: "temporal-frame", started_at: new Date(now - 74_000).toISOString() };
    const msg = factoryStatusReply(lock, false, now);
    expect(msg).toContain("temporal-frame");
    expect(msg).toContain("1m 14s");
  });

  test("no lock but a live startup group → 'starting up', not 'no build running'", () => {
    const msg = factoryStatusReply(null, true, 0);
    expect(msg).toContain("starting up");
    expect(msg).not.toBe("no build running");
  });

  test("no lock and no startup group → 'no build running'", () => {
    expect(factoryStatusReply(null, false, 0)).toBe("no build running");
  });

  test("a held lock wins even if a startup group also looks alive", () => {
    const now = 1_000_000;
    const lock = { idea_slug: "foo", started_at: new Date(now - 1_000).toISOString() };
    expect(factoryStatusReply(lock, true, now)).toContain("foo");
  });
});
