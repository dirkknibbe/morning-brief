import { describe, test, expect } from "bun:test";
import { DISCORD_ENV_KEYS, loadDiscordConfig } from "../discord/config";

const FULL_ENV: Record<string, string> = {
  DISCORD_BOT_TOKEN: "tok-abc",
  DISCORD_GUILD_ID: "111",
  DISCORD_FACTORY_CHANNEL_ID: "222",
  DISCORD_BRIEF_CHANNEL_ID: "333",
  DISCORD_ALLOWED_USER_ID: "444",
};

describe("loadDiscordConfig", () => {
  test("maps all five keys into a config object", () => {
    const config = loadDiscordConfig(FULL_ENV);
    expect(config).toEqual({
      botToken: "tok-abc",
      guildId: "111",
      factoryChannelId: "222",
      briefChannelId: "333",
      allowedUserId: "444",
    });
  });

  test("throws naming the single missing key", () => {
    const { DISCORD_GUILD_ID: _omit, ...env } = FULL_ENV;
    expect(() => loadDiscordConfig(env)).toThrow("DISCORD_GUILD_ID");
  });

  test("throws naming ALL missing keys when env is empty", () => {
    try {
      loadDiscordConfig({});
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      for (const key of DISCORD_ENV_KEYS) {
        expect(message).toContain(key);
      }
    }
  });

  test("error message names keys, never leaks present values", () => {
    const env = { ...FULL_ENV };
    delete env.DISCORD_ALLOWED_USER_ID;
    try {
      loadDiscordConfig(env);
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("DISCORD_ALLOWED_USER_ID");
      expect(message).not.toContain("tok-abc");
      expect(message).not.toContain("111");
    }
  });

  test("blank (whitespace-only) values count as missing", () => {
    const env = { ...FULL_ENV, DISCORD_BOT_TOKEN: "   " };
    expect(() => loadDiscordConfig(env)).toThrow("DISCORD_BOT_TOKEN");
  });
});
