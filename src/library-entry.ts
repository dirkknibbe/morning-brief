/**
 * library-entry.ts — pure parsing/validation/ranking for research-library
 * entries. No I/O; library.ts is the I/O layer (mirrors the
 * dedupe-ideas.ts / ideas-state.ts split).
 *
 * Entry contract (docs/superpowers/specs/2026-06-11-librarian-design.md):
 * YAML frontmatter with slug/title/summary/tags/sources/first_read/
 * last_updated/runs, then a markdown body. Parsed with Bun.YAML (no
 * dependency); format constrained — inline arrays, single-line scalars,
 * quoted dates — and validated hard here.
 */

import { cosine } from "./embeddings";

export interface LibraryEntry {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  sources: string[];
  first_read: string;
  last_updated: string;
  runs: string[];
  body: string;
}

export interface IndexedEntry {
  slug: string;
  title: string;
  path: string;
  summary: string;
  embedding: number[];
}

export interface RankedEntry {
  slug: string;
  title: string;
  path: string;
  summary: string;
  score: number;
}

const SLUG_RE = /^[a-z0-9-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLibraryEntry(md: string, path: string): LibraryEntry {
  if (!md.startsWith("---\n")) throw new Error(`${path}: missing frontmatter open delimiter`);
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) throw new Error(`${path}: missing frontmatter close delimiter`);
  const front = md.slice(4, end + 1);
  const body = md.slice(end + 5).trim();

  let raw: unknown;
  try {
    raw = Bun.YAML.parse(front);
  } catch (e) {
    throw new Error(`${path}: invalid YAML frontmatter: ${(e as Error).message}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: frontmatter must be a YAML mapping`);
  }
  const f = raw as Record<string, unknown>;

  const str = (k: string): string => {
    const v = f[k];
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`${path}: frontmatter "${k}" must be a non-empty string`);
    }
    return v.trim();
  };
  const strArr = (k: string): string[] => {
    const v = f[k];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      throw new Error(`${path}: frontmatter "${k}" must be an array of strings`);
    }
    return v as string[];
  };
  const dateStr = (k: string): string => {
    const v = str(k);
    if (!DATE_RE.test(v)) throw new Error(`${path}: frontmatter "${k}" must be YYYY-MM-DD`);
    return v;
  };

  const slug = str("slug");
  if (!SLUG_RE.test(slug)) throw new Error(`${path}: slug must match ${SLUG_RE} (got "${slug}")`);
  if (body === "") throw new Error(`${path}: entry body is empty`);

  return {
    slug,
    title: str("title"),
    summary: str("summary"),
    tags: strArr("tags"),
    sources: strArr("sources"),
    first_read: dateStr("first_read"),
    last_updated: dateStr("last_updated"),
    runs: strArr("runs"),
    body,
  };
}

export function embedText(e: LibraryEntry): string {
  return `${e.title}\n${e.summary}\n${e.body}`;
}

export function rankBySimilarity(
  query: Float32Array,
  entries: ReadonlyArray<IndexedEntry>,
  k: number,
): RankedEntry[] {
  return entries
    .map((e) => ({
      slug: e.slug,
      title: e.title,
      path: e.path,
      summary: e.summary,
      score: Math.round(cosine(query, Float32Array.from(e.embedding)) * 1000) / 1000,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, k));
}
