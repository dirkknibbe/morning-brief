import { describe, expect, test } from "bun:test";
import { hnId, redditId, ghId } from "../sources.ts";

describe("id helpers", () => {
  test("hnId prefixes with hn:", () => {
    expect(hnId(12345)).toBe("hn:12345");
    expect(hnId("abc")).toBe("hn:abc");
  });
  test("redditId prefixes with reddit:", () => {
    expect(redditId("t3_xyz")).toBe("reddit:t3_xyz");
  });
  test("ghId prefixes with gh:", () => {
    expect(ghId("anthropics/claude-code")).toBe("gh:anthropics/claude-code");
  });
});
