/**
 * send-core.ts — pure pieces of the Discord send path (`bun run send`).
 *
 * The CLI contract is frozen (matches the Telegram sender): body from stdin,
 * `sent N chars to <transport>` on stdout, exit 0 on success / non-zero on
 * failure. Splitting reuses the Telegram sender's splitMessage, at Discord's
 * 2000-char limit.
 */

import { splitMessage } from "../telegram";

export const DISCORD_MAX_MESSAGE_LEN = 2000;

/**
 * Handoff file written by the listener when a build thread is created.
 * Same pattern as /tmp/morning-brief-factory.pgid (written by
 * scripts/start-factory.sh, consumed by /abort).
 */
export const THREAD_HANDOFF_FILE = "/tmp/morning-brief-discord-thread";

/**
 * Env var set by scripts/start-factory.sh on the whole factory process tree.
 * Used to tell factory-originated sends (heartbeats — route to the build
 * thread) apart from everything else (morning brief — route to #brief), so a
 * stale handoff file left by a *finished* build can't hijack the brief.
 */
export const FACTORY_SENDER_ENV_KEY = "IDEA_SLUG";

/**
 * Discord snowflake shape. The handoff file lives in world-writable /tmp, so
 * its contents are untrusted: anything else (e.g. "123/../other-endpoint",
 * which survives URL normalization) must never reach the REST URL.
 */
const SNOWFLAKE_REGEX = /^\d{17,20}$/;

export function isSnowflake(id: string): boolean {
  return SNOWFLAKE_REGEX.test(id);
}

export function splitForDiscord(text: string): string[] {
  return splitMessage(text, DISCORD_MAX_MESSAGE_LEN);
}

export function successLine(charCount: number): string {
  return `sent ${charCount} chars to discord`;
}

export interface SendTarget {
  readonly channelId: string;
  readonly kind: "channel" | "thread";
}

export function resolveSendTarget(args: {
  briefChannelId: string;
  threadId: string | null;
  isFactorySender: boolean;
}): SendTarget {
  if (args.threadId && args.isFactorySender) {
    return { channelId: args.threadId, kind: "thread" };
  }
  return { channelId: args.briefChannelId, kind: "channel" };
}
