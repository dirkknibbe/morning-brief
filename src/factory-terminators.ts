/**
 * factory-terminators.ts — pure cap + stuck detection for the factory loop.
 *
 * Cosine-based stuck detection takes PRECOMPUTED unit vectors so this module
 * has no I/O and is fully unit-testable. The trigger embeds hypothesis text
 * via src/embeddings.ts `embed()` and passes the vectors here.
 */
import { cosine } from "./embeddings";

export const DEFAULT_MAX_ROUNDS = 20;
export const DEFAULT_MAX_MS = 30 * 60 * 1000; // 30 minutes

export interface CapOpts {
  maxRounds?: number;
  maxMs?: number;
}

export function isCapped(round: number, elapsedMs: number, opts: CapOpts = {}): boolean {
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  return round > maxRounds || elapsedMs > maxMs;
}

/**
 * True when the last `window` failing-test counts show no decrease — i.e. no
 * progress. A single decrease anywhere in the window resets the verdict to
 * false (progress was made). Fewer than `window` rounds is never stagnant.
 */
export function failingStagnant(failingCounts: number[], window = 5): boolean {
  if (failingCounts.length < window) return false;
  const recent = failingCounts.slice(-window);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] < recent[i - 1]) return false;
  }
  return true;
}

export function maxPairwiseCosine(vectors: Float32Array[]): number {
  let max = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const s = cosine(vectors[i], vectors[j]);
      if (s > max) max = s;
    }
  }
  return max;
}

export interface StuckOpts {
  window?: number;
  cosineThreshold?: number;
}

/**
 * Stuck = `window` rounds of non-decreasing failing counts AND the recent
 * hypotheses are near-duplicates (max pairwise cosine > threshold).
 */
export function decideStuck(
  failingCounts: number[],
  hypothesisVectors: Float32Array[],
  opts: StuckOpts = {},
): boolean {
  const window = opts.window ?? 5;
  const threshold = opts.cosineThreshold ?? 0.9;
  if (!failingStagnant(failingCounts, window)) return false;
  const recentVecs = hypothesisVectors.slice(-window);
  if (recentVecs.length < 2) return false;
  return maxPairwiseCosine(recentVecs) > threshold;
}
