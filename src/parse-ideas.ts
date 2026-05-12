/**
 * parse-ideas.ts — extract candidate ideas from morning-brief markdown.
 *
 * Pure functions. No I/O, no Mongo. Used by extract-ideas.ts.
 */

export interface IdeaCandidate {
  title: string;
  raw_text: string;
  source_file: string;
  source_section: string;
  theme_hints: string[];
  extracted_at: Date;
}

function summarize(text: string, maxLen = 80): string {
  // Strip markdown emphasis markers (*, **, _, __) so they don't leak into titles.
  const stripped = text.replace(/[*_]+/g, "").trim();
  // Prefer the em-dash/en-dash as the title/description boundary (common in briefs).
  // Fall back to a period followed by a space. Don't split on bare hyphens —
  // they appear inside compound words like "Agent-spend" and dot-versions like "1.x".
  const split = stripped.split(/[—–]|\.\s/);
  const firstClause = split[0].trim();
  return firstClause.length <= maxLen ? firstClause : firstClause.slice(0, maxLen).trim();
}

export function parseIdeasFromBrief(markdown: string, source_file: string): IdeaCandidate[] {
  const out: IdeaCandidate[] = [];
  const now = new Date();

  // 💡 *Opportunity Sparks* — bullets until next section marker or EOF.
  // Section markers in briefs are emoji + *Bold* on a line, or **Action for today**, or ## heading.
  // Use \n\n to stop at blank-line-separated sections (emoji headers are separated by blank lines).
  const sparks = markdown.match(
    /💡\s*\*Opportunity Sparks\*\s*\n([\s\S]+?)(?=\n\n|\n[🔥😤💰🛠️📈💡]\s*\*|\n\*{1,2}[^*\n]*Action\b|\n## |$)/i
  );
  if (sparks) {
    const lines = sparks[1].split("\n");
    for (const ln of lines) {
      const trimmed = ln.trim();
      // Accept dash, bullet, or numbered list items. Briefs from different
      // days use different conventions (- vs 1.); we don't want to silently
      // drop one format.
      if (!/^(?:[-•]|\d+\.)/.test(trimmed)) continue;
      const text = trimmed.replace(/^(?:[-•]|\d+\.)\s*/, "").trim();
      if (!text) continue;
      out.push({
        title: summarize(text),
        raw_text: text,
        source_file,
        source_section: "Opportunity Sparks",
        theme_hints: [],
        extracted_at: now,
      });
    }
  }

  // Action for today — re-uses the same tolerant regex from parse-action.ts.
  const actionRe = /\*{1,2}[^*\n]*\bAction\b[^*\n]*\*{1,2}\s*:?\s*([\s\S]+?)(?:\n\s*\n|$)/i;
  const action = markdown.match(actionRe);
  if (action) {
    const text = action[1].trim();
    out.push({
      title: summarize(text),
      raw_text: text,
      source_file,
      source_section: "Action for today",
      theme_hints: [],
      extracted_at: now,
    });
  }

  return out;
}

export function parseIdeasFromAction(markdown: string, source_file: string): IdeaCandidate[] {
  const out: IdeaCandidate[] = [];
  const now = new Date();

  // ## Concrete next steps for Dirk — numbered list "1. ...", "2. ..."
  const steps = markdown.match(
    /## Concrete next steps for Dirk\s*\n([\s\S]+?)(?=\n## |\n---|$)/i
  );
  if (steps) {
    // Split on newlines that start a new "N." item, then keep only numbered lines.
    const items = steps[1]
      .split(/\n(?=\s*\d+\.)/)
      .map((s) => s.trim())
      .filter((s) => /^\d+\./.test(s))
      .map((s) => s.replace(/^\d+\.\s*/, "").trim());
    for (const text of items) {
      if (!text) continue;
      out.push({
        title: summarize(text),
        raw_text: text,
        source_file,
        source_section: "Concrete next steps",
        theme_hints: [],
        extracted_at: now,
      });
    }
  }

  return out;
}
