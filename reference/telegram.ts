/**
 * Morning Brief - Telegram Delivery
 *
 * Sends the synthesized brief to your Telegram chat.
 * Handles message splitting for Telegram's 4096 char limit.
 */

const TG_API = "https://api.telegram.org";

export async function sendToTelegram(
  brief: string,
  options?: { dryRun?: boolean }
): Promise<void> {
  if (options?.dryRun) {
    console.log("\n📋 DRY RUN — would send this brief:\n");
    console.log(brief);
    console.log(`\n(${brief.length} chars)`);
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error(
      "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment"
    );
  }

  // Telegram max message length is 4096 chars
  const chunks = splitMessage(brief, 4096);

  for (const chunk of chunks) {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      // If Markdown parsing fails, retry without it
      if (err.includes("can't parse entities")) {
        console.warn("⚠️  Markdown parse failed, retrying as plain text...");
        await fetch(`${TG_API}/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            disable_web_page_preview: true,
          }),
        });
      } else {
        throw new Error(`Telegram API error: ${err}`);
      }
    }

    // Small delay between chunks to maintain order
    if (chunks.length > 1) await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`📨 Brief sent to Telegram (${chunks.length} message(s))`);
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline near the limit
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) {
      // No good newline break, split at space
      splitAt = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitAt < maxLen * 0.3) {
      // Hard split as last resort
      splitAt = maxLen;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
