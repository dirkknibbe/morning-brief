/**
 * telegram.ts — Bot API delivery.
 *
 * Library: `sendToTelegram(text, { dryRun })`.
 * CLI: reads stdin and sends. `--dry-run` prints instead.
 */

const TG_API = "https://api.telegram.org";

export async function sendToTelegram(
  brief: string,
  options?: { dryRun?: boolean }
): Promise<void> {
  if (options?.dryRun) {
    console.log("--- DRY RUN ---");
    console.log(brief);
    console.log(`--- (${brief.length} chars) ---`);
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  }

  const chunks = splitMessage(brief, 4096);
  for (const chunk of chunks) {
    await sendChunkWithRetry(token, chatId, chunk);
    if (chunks.length > 1) await new Promise((r) => setTimeout(r, 500));
  }
}

async function sendChunkWithRetry(token: string, chatId: string, chunk: string): Promise<void> {
  const body = (plain: boolean) =>
    JSON.stringify({
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
      ...(plain ? {} : { parse_mode: "Markdown" }),
    });

  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body(false),
    });
    if (res.ok) return;
    lastErr = await res.text();
    // Markdown parse failure → fall back to plain text once, immediately.
    if (lastErr.includes("can't parse entities")) {
      const plain = await fetch(`${TG_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body(true),
      });
      if (plain.ok) return;
      lastErr = await plain.text();
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`Telegram API error after retry: ${lastErr}`);
}

export function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
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
    console.error("telegram: stdin was empty");
    process.exit(1);
  }
  await sendToTelegram(text, { dryRun });
  if (!dryRun) console.log(`sent ${text.length} chars to telegram`);
}
