/**
 * Morning Brief - Main Entry
 *
 * Usage:
 *   bun run src/index.ts            # fetch, synthesize, send to Telegram
 *   bun run src/index.ts --dry-run  # fetch, synthesize, print to console
 */

import { fetchAllSources } from "./sources.ts";
import { synthesizeBrief } from "./synthesize.ts";
import { sendToTelegram } from "./telegram.ts";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const startTime = Date.now();
  console.log(
    `\n☀️  Morning Brief — ${new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}\n`
  );

  // 1. Gather raw data
  const rawData = await fetchAllSources();

  const totalItems =
    rawData.hn.length + rawData.reddit.length + rawData.github.length;

  if (totalItems === 0) {
    const msg =
      "☕ Morning Brief: All sources returned empty today. Check your network or try again later.";
    await sendToTelegram(msg, { dryRun });
    return;
  }

  // 2. Synthesize with Claude
  const brief = await synthesizeBrief(rawData);

  // 3. Deliver
  const header = `☀️ *Morning Brief* — ${new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })}\n\n`;

  await sendToTelegram(header + brief, { dryRun });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s`);
}

main().catch((err) => {
  console.error("❌ Morning Brief failed:", err);
  process.exit(1);
});
