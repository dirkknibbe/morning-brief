/**
 * gate.ts — allowlist gate for every Discord interaction/message.
 *
 * Fail closed: missing or unknown guild/channel/user → refused. The reason
 * string is safe to log (ids only, no secrets).
 */

import type { DiscordConfig } from "./config";

export interface InteractionOrigin {
  readonly guildId: string | null | undefined;
  readonly channelId: string | null | undefined;
  readonly userId: string | null | undefined;
}

export type GateResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

export function checkAccess(
  config: DiscordConfig,
  origin: InteractionOrigin
): GateResult {
  if (!origin.guildId || origin.guildId !== config.guildId) {
    return { allowed: false, reason: `guild not allowed: ${origin.guildId ?? "none"}` };
  }
  const allowedChannels = [config.factoryChannelId, config.briefChannelId];
  if (!origin.channelId || !allowedChannels.includes(origin.channelId)) {
    return { allowed: false, reason: `channel not allowed: ${origin.channelId ?? "none"}` };
  }
  if (!origin.userId || origin.userId !== config.allowedUserId) {
    return { allowed: false, reason: `user not allowed: ${origin.userId ?? "none"}` };
  }
  return { allowed: true };
}
