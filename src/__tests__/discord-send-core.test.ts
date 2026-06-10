import { describe, test, expect } from "bun:test";
import {
  DISCORD_MAX_MESSAGE_LEN,
  isSnowflake,
  resolveSendTarget,
  splitForDiscord,
  successLine,
} from "../discord/send-core";

describe("isSnowflake", () => {
  test("accepts real Discord ids (17-20 digits)", () => {
    expect(isSnowflake("1381742183721934868")).toBe(true);
    expect(isSnowflake("12345678901234567")).toBe(true);
  });

  test("rejects path-traversal payloads from a planted handoff file", () => {
    expect(isSnowflake("123/../../webhooks/x/y")).toBe(false);
    expect(isSnowflake("1381742183721934868/messages")).toBe(false);
  });

  test("rejects empty, short, long, and non-numeric values", () => {
    expect(isSnowflake("")).toBe(false);
    expect(isSnowflake("1234567890123456")).toBe(false); // 16 digits
    expect(isSnowflake("123456789012345678901")).toBe(false); // 21 digits
    expect(isSnowflake("abc-not-an-id")).toBe(false);
    expect(isSnowflake("138174218372193486 ")).toBe(false);
  });
});

describe("splitForDiscord", () => {
  test("short message stays a single chunk", () => {
    expect(splitForDiscord("hello")).toEqual(["hello"]);
  });

  test("message at exactly the limit stays a single chunk", () => {
    const text = "a".repeat(DISCORD_MAX_MESSAGE_LEN);
    expect(splitForDiscord(text)).toEqual([text]);
  });

  test("long message splits with every chunk within the limit", () => {
    const line = "x".repeat(120);
    const text = Array.from({ length: 40 }, () => line).join("\n"); // ~4.8KB
    const chunks = splitForDiscord(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DISCORD_MAX_MESSAGE_LEN);
    }
  });

  test("prefers newline boundaries (no mid-line cuts)", () => {
    const line = "y".repeat(150);
    const text = Array.from({ length: 30 }, () => line).join("\n");
    const chunks = splitForDiscord(text);
    for (const chunk of chunks) {
      for (const piece of chunk.split("\n")) {
        expect(piece.length).toBe(150);
      }
    }
  });

  test("no content is lost across the split", () => {
    const line = "z".repeat(99);
    const text = Array.from({ length: 50 }, () => line).join("\n");
    const rejoined = splitForDiscord(text).join("\n");
    expect(rejoined.replaceAll("\n", "")).toBe(text.replaceAll("\n", ""));
  });
});

describe("successLine", () => {
  test("matches the frozen `sent N chars` shape", () => {
    expect(successLine(1234)).toBe("sent 1234 chars to discord");
  });
});

describe("resolveSendTarget", () => {
  const BRIEF = "chan-brief";

  test("defaults to the brief channel", () => {
    const target = resolveSendTarget({
      briefChannelId: BRIEF,
      threadId: null,
      isFactorySender: false,
    });
    expect(target).toEqual({ channelId: BRIEF, kind: "channel" });
  });

  test("factory sender with a handoff thread posts to the thread", () => {
    const target = resolveSendTarget({
      briefChannelId: BRIEF,
      threadId: "thread-9",
      isFactorySender: true,
    });
    expect(target).toEqual({ channelId: "thread-9", kind: "thread" });
  });

  test("stale handoff file does NOT hijack a non-factory send", () => {
    const target = resolveSendTarget({
      briefChannelId: BRIEF,
      threadId: "thread-9",
      isFactorySender: false,
    });
    expect(target).toEqual({ channelId: BRIEF, kind: "channel" });
  });

  test("factory sender without a thread falls back to the brief channel", () => {
    const target = resolveSendTarget({
      briefChannelId: BRIEF,
      threadId: null,
      isFactorySender: true,
    });
    expect(target).toEqual({ channelId: BRIEF, kind: "channel" });
  });
});
