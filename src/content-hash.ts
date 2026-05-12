import { createHash } from "node:crypto";

/**
 * Stable content hash for an idea candidate.
 *
 * Normalizes case + punctuation so two briefs phrasing the same idea
 * slightly differently still collide. This is the *exact-hash* dedupe
 * layer; semantic (embedding) dedupe lives in a later phase.
 */
export function contentHash(title: string, body: string): string {
  const normalized = (title + "\n" + body)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}
