/**
 * config.ts — Discord env config: parse + validate the five DISCORD_* keys.
 *
 * Fails fast with a message listing MISSING KEY NAMES only — never values.
 */

export const DISCORD_ENV_KEYS = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_ID",
  "DISCORD_FACTORY_CHANNEL_ID",
  "DISCORD_BRIEF_CHANNEL_ID",
  "DISCORD_ALLOWED_USER_ID",
] as const;

export type DiscordEnvKey = (typeof DISCORD_ENV_KEYS)[number];

export interface DiscordConfig {
  readonly botToken: string;
  readonly guildId: string;
  readonly factoryChannelId: string;
  readonly briefChannelId: string;
  readonly allowedUserId: string;
}

export function loadDiscordConfig(
  env: Record<string, string | undefined>
): DiscordConfig {
  const missing = DISCORD_ENV_KEYS.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === "";
  });
  if (missing.length > 0) {
    throw new Error(`discord config: missing env keys: ${missing.join(", ")}`);
  }
  return {
    botToken: env.DISCORD_BOT_TOKEN!,
    guildId: env.DISCORD_GUILD_ID!,
    factoryChannelId: env.DISCORD_FACTORY_CHANNEL_ID!,
    briefChannelId: env.DISCORD_BRIEF_CHANNEL_ID!,
    allowedUserId: env.DISCORD_ALLOWED_USER_ID!,
  };
}
