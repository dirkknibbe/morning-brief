import { describe, test, expect } from "bun:test";
import { checkAccess } from "../discord/gate";
import type { DiscordConfig } from "../discord/config";

const CONFIG: DiscordConfig = {
  botToken: "tok",
  guildId: "guild-1",
  factoryChannelId: "chan-factory",
  briefChannelId: "chan-brief",
  allowedUserId: "user-dirk",
};

describe("checkAccess", () => {
  test("allows the configured guild + factory channel + user", () => {
    const result = checkAccess(CONFIG, {
      guildId: "guild-1",
      channelId: "chan-factory",
      userId: "user-dirk",
    });
    expect(result.allowed).toBe(true);
  });

  test("allows the brief channel too", () => {
    const result = checkAccess(CONFIG, {
      guildId: "guild-1",
      channelId: "chan-brief",
      userId: "user-dirk",
    });
    expect(result.allowed).toBe(true);
  });

  test("refuses an unknown guild", () => {
    const result = checkAccess(CONFIG, {
      guildId: "guild-evil",
      channelId: "chan-factory",
      userId: "user-dirk",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("guild");
  });

  test("fails closed when guild is missing (DM)", () => {
    const result = checkAccess(CONFIG, {
      guildId: null,
      channelId: "chan-factory",
      userId: "user-dirk",
    });
    expect(result.allowed).toBe(false);
  });

  test("refuses an unknown channel in the right guild", () => {
    const result = checkAccess(CONFIG, {
      guildId: "guild-1",
      channelId: "chan-random",
      userId: "user-dirk",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("channel");
  });

  test("refuses an unknown user in the right guild+channel", () => {
    const result = checkAccess(CONFIG, {
      guildId: "guild-1",
      channelId: "chan-factory",
      userId: "user-stranger",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("user");
  });

  test("fails closed when user is missing", () => {
    const result = checkAccess(CONFIG, {
      guildId: "guild-1",
      channelId: "chan-factory",
      userId: undefined,
    });
    expect(result.allowed).toBe(false);
  });
});
