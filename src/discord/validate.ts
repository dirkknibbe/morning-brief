/**
 * validate.ts — input validation for the Discord listener.
 *
 * The slug regex is the injection boundary: nothing that fails it may ever
 * reach a shell-out (and even valid slugs are passed as argv array elements,
 * never interpolated into a shell string).
 */

export const SLUG_REGEX = /^[a-z0-9-]+$/;

/** Discard command interactions older than this (startup-replay guard). */
export const STALE_INTERACTION_CUTOFF_MS = 5 * 60 * 1000;

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === "string" && SLUG_REGEX.test(slug);
}

export function isStaleInteraction(
  createdTimestampMs: number,
  nowMs: number
): boolean {
  return nowMs - createdTimestampMs > STALE_INTERACTION_CUTOFF_MS;
}
