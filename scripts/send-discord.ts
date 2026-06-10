/**
 * send-discord.ts — Discord backend for `bun run send`.
 *
 * FROZEN CLI contract (same as the Telegram sender it replaces):
 *   - message body from stdin (`printf '%s' "msg" | bun run send`)
 *   - `--dry-run` prints instead of sending
 *   - stdout `sent N chars to discord` + exit 0 on success
 *   - exit 1 on empty stdin; non-zero on delivery failure
 *
 * Routing: DISCORD_BRIEF_CHANNEL_ID by default. Factory-originated sends
 * (IDEA_SLUG env set by scripts/start-factory.sh) go to the build thread in
 * the /tmp handoff file written by the listener, so heartbeats land there.
 */

import { existsSync, readFileSync } from "node:fs";
import {
  FACTORY_SENDER_ENV_KEY,
  THREAD_HANDOFF_FILE,
  isSnowflake,
  resolveSendTarget,
  splitForDiscord,
  successLine,
} from "../src/discord/send-core";

const DISCORD_API = "https://discord.com/api/v10";
const CHUNK_DELAY_MS = 500;
// Matches the Telegram sender this replaces: one retry on transient failures
// (triggers/scheduled-brief.md relies on it).
const TRANSIENT_RETRY_DELAY_MS = 750;
const HTTP_SERVER_ERROR_MIN = 500;

export async function sendToDiscord(
  text: string,
  options?: { dryRun?: boolean }
): Promise<void> {
  if (options?.dryRun) {
    console.log("--- DRY RUN ---");
    console.log(text);
    console.log(`--- (${text.length} chars) ---`);
    return;
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  const briefChannelId = process.env.DISCORD_BRIEF_CHANNEL_ID;
  if (!token || !briefChannelId) {
    throw new Error("Missing DISCORD_BOT_TOKEN or DISCORD_BRIEF_CHANNEL_ID");
  }

  const target = resolveSendTarget({
    briefChannelId,
    threadId: readThreadHandoff(),
    isFactorySender: Boolean(process.env[FACTORY_SENDER_ENV_KEY]),
  });

  const chunks = splitForDiscord(text);
  for (const chunk of chunks) {
    await postChunkWithRetry(token, target.channelId, chunk);
    if (chunks.length > 1) await Bun.sleep(CHUNK_DELAY_MS);
  }
}

function readThreadHandoff(): string | null {
  try {
    if (!existsSync(THREAD_HANDOFF_FILE)) return null;
    const id = readFileSync(THREAD_HANDOFF_FILE, "utf8").trim();
    // /tmp is world-writable: only a snowflake (what the listener writes) may
    // be interpolated into the bot-authenticated REST path.
    return isSnowflake(id) ? id : null;
  } catch {
    return null; // unreadable handoff file → default routing
  }
}

/** POST one message; on 429 wait the advertised retry_after and retry once;
 *  on a 5xx or a network-level rejection retry once after a short delay. */
async function postChunkWithRetry(
  token: string,
  channelId: string,
  chunk: string
): Promise<void> {
  const post = () =>
    fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: chunk }),
    });

  let res: Response;
  try {
    res = await post();
  } catch {
    await Bun.sleep(TRANSIENT_RETRY_DELAY_MS);
    res = await post(); // second rejection propagates to the caller
  }
  if (res.status === 429) {
    const retryAfterSec = await rateLimitRetryAfterSec(res);
    await Bun.sleep(retryAfterSec * 1000);
    res = await post();
  } else if (res.status >= HTTP_SERVER_ERROR_MIN) {
    await Bun.sleep(TRANSIENT_RETRY_DELAY_MS);
    res = await post();
  }
  if (!res.ok) {
    throw new Error(`Discord API error ${res.status}: ${await res.text()}`);
  }
}

const DEFAULT_RETRY_AFTER_SEC = 1;

async function rateLimitRetryAfterSec(res: Response): Promise<number> {
  try {
    const body = (await res.json()) as { retry_after?: number };
    if (typeof body.retry_after === "number") return body.retry_after;
  } catch {
    // fall through to header
  }
  const header = Number(res.headers.get("Retry-After"));
  return Number.isFinite(header) && header > 0 ? header : DEFAULT_RETRY_AFTER_SEC;
}

// ── CLI entrypoint: read stdin, send ──────────────────────────────────

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run");
  const text = (await readStdin()).trim();
  if (!text) {
    console.error("discord: stdin was empty");
    process.exit(1);
  }
  await sendToDiscord(text, { dryRun });
  if (!dryRun) console.log(successLine(text.length));
}
