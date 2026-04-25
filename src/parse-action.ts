/**
 * parse-action.ts — extract the "Action for today" section from the latest brief.
 *
 * Usage: bun run src/parse-action.ts [YYYY-MM-DD]
 *
 * Prints JSON: { date, briefPath, action } where `action` is the
 * text after the "Action for today:" marker up to the next blank line
 * or end-of-file. Exits 1 if no action block is found.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ParsedAction {
  date: string;
  briefPath: string;
  action: string;
}

export function parseAction(date: string, briefsDir = "briefs"): ParsedAction {
  const candidates = [
    join(briefsDir, `${date}-rerun.md`),
    join(briefsDir, `${date}.md`),
  ];
  const briefPath = candidates.find((p) => existsSync(p));
  if (!briefPath) throw new Error(`No brief found for ${date} (tried ${candidates.join(", ")})`);

  const body = readFileSync(briefPath, "utf8");

  // Match any bold-wrapped line containing "Action" or "Today" followed by
  // a colon (inside or outside the asterisks) and the action text. Tolerates
  // emoji prefixes, "Action for today", "Action item", "Today's action", "Today:" etc.
  const re = /\*{1,2}[^*\n]*\b(?:Action|Today)\b[^*\n]*\*{1,2}\s*:?\s*([\s\S]+?)(?:\n\s*\n|$)/i;
  const m = body.match(re);
  if (!m) throw new Error(`No "Action for today" block in ${briefPath}`);

  return { date, briefPath, action: m[1].trim() };
}

if (import.meta.main) {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  try {
    const parsed = parseAction(date);
    process.stdout.write(JSON.stringify(parsed, null, 2) + "\n");
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
