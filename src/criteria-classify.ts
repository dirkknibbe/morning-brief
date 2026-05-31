/**
 * criteria-classify.ts — bucket a success-criterion string into how it can be
 * verified. Pure, deterministic, heuristic. The factory trigger's LLM may
 * upgrade/downgrade a classification, but this is the first pass and the
 * thing we test against real triage output.
 *
 *  - "test"             → an executable test asserting runtime behavior.
 *  - "scriptable"       → a non-test assertion: file exists, line count,
 *                         exported symbol, manifest schema, artifact shape.
 *  - "human_or_external"→ needs a human action (screencast, signup) or an
 *                         external harness (loads in Claude Code, paid API).
 *
 * Order matters: human_or_external is checked first (most important not to
 * mis-bucket — these become the handoff checklist, never a scope-break),
 * then behavioral "test" signals, then "scriptable", then a scriptable
 * default (most criteria are artifact-ish).
 */
export type CriterionKind = "test" | "scriptable" | "human_or_external";

export interface Classification {
  text: string;
  kind: CriterionKind;
  rationale: string;
}

const HUMAN_OR_EXTERNAL: RegExp[] = [
  /screencast|screen recording|\brecord(ed|ing)?\b|\bvideo\b|\bloom\b/i,
  /demo day|present(ation|s)?\b|\bpitch\b/i,
  /sign[ -]?up|\bsignup\b|create an account|requires? .*account/i,
  /\bmanually\b|by hand|human (review|sign-?off|action)/i,
  /loads? (in|via) .*claude code|claude code skill tool|skill tool in claude/i,
  /external (service|api|infra|harness)|paid api|third-?party service/i,
  /publish(ed)? to|submit(ted)? to|email(ed)? to/i,
];

const TEST: RegExp[] = [
  /\breturns?\b|\basserts?\b|\bequals?\b|evaluates? to/i,
  /same .* across|stable across|idempotent|deterministic|round-?trip/i,
  /given .* when .* then|for (a|an|any) .* input|when called/i,
];

const SCRIPTABLE: RegExp[] = [
  /under \d+ ?lines|<\s*\d+ ?lines|\bline count\b/i,
  /\bdefines?\b|\bexposes?\b|\bexports?\b|\bdeclares?\b/i,
  /\bfile\b|\bstub\b|\bsnippet\b|\bexists?\b/i,
  /\bmanifest\b|\bschema\b|\bsignature\b/i,
  /\.(py|ts|tsx|js|md|json|toml|ya?ml)\b/i,
];

function firstMatch(text: string, res: RegExp[]): RegExp | null {
  for (const re of res) if (re.test(text)) return re;
  return null;
}

export function classifyCriterion(text: string): Classification {
  const he = firstMatch(text, HUMAN_OR_EXTERNAL);
  if (he) return { text, kind: "human_or_external", rationale: `human/external signal: ${he.source}` };

  const t = firstMatch(text, TEST);
  if (t) return { text, kind: "test", rationale: `executable-test signal: ${t.source}` };

  const s = firstMatch(text, SCRIPTABLE);
  if (s) return { text, kind: "scriptable", rationale: `scriptable-assertion signal: ${s.source}` };

  return { text, kind: "scriptable", rationale: "no strong signal; defaulting to scriptable artifact check" };
}

export function classifyAll(criteria: string[]): Classification[] {
  return criteria.map(classifyCriterion);
}
