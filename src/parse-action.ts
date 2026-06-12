/**
 * parse-action.ts — extract the "Action today" block from the latest brief.
 *
 * Usage: bun run src/parse-action.ts [YYYY-MM-DD]
 *
 * Prints JSON: { date, briefPath, action }. A marker line must start at
 * line start (emoji/symbol prefixes allowed), contain a bold span whose
 * text contains the word "action" (case-insensitive), and have a colon
 * inside the bold or immediately after it. `action` is the rest of that
 * line plus following lines up to the first blank line. Exits 1 if no
 * marker line is found.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ParsedAction {
  date: string;
  briefPath: string;
  action: string;
}

/**
 * A marker line must:
 *   - start at line start (optional emoji/symbol prefixes allowed, e.g. "🎯 "),
 *   - contain a bold span (*...* or **...**) whose text contains the word
 *     "action" (case-insensitive), and
 *   - have a colon inside the bold or immediately after it.
 * The action text is the remainder of that line plus following lines up to
 * the first blank line. Mid-paragraph *emphasis* can no longer match
 * (2026-06-05 garbage-capture bug).
 */
const MARKER =
  /^[^\S\n]*(?:[^\w\s*][^\S\n]*)*\*{1,2}([^*\n]*)\*{1,2}[^\S\n]*(:?)/i;

export function parseActionFromBody(body: string, briefPath: string): string {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(MARKER);
    if (!m) continue;
    const boldInner = m[1];
    const hasAction = /\baction\b/i.test(boldInner);
    const hasColon = boldInner.includes(":") || m[2] === ":";
    if (!hasAction || !hasColon) continue;

    const sameLine = lines[i].slice(m[0].length).replace(/^:/, "").trim();
    const rest: string[] = sameLine ? [sameLine] : [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") break;
      rest.push(lines[j]);
    }
    const action = rest.join("\n").trim();
    if (action) return action;
  }
  throw new Error(`No "Action today" block in ${briefPath}`);
}

export function parseAction(date: string, briefsDir = "briefs"): ParsedAction {
  const candidates = [
    join(briefsDir, `${date}-rerun.md`),
    join(briefsDir, `${date}.md`),
  ];
  const briefPath = candidates.find((p) => existsSync(p));
  if (!briefPath) throw new Error(`No brief found for ${date} (tried ${candidates.join(", ")})`);

  const body = readFileSync(briefPath, "utf8");
  return { date, briefPath, action: parseActionFromBody(body, briefPath) };
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
