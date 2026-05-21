/**
 * cluster-ideas.ts — pure clustering for the synthesize stage.
 *
 * Returns clusters of 2-4 IDs where every pairwise cosine similarity
 * falls in the mid-band [LOW, HIGH]. Below LOW = unrelated; above HIGH =
 * near-duplicates (reinforce/merge already handles those).
 */

import { cosine } from "./embeddings";

export interface ClusterItem {
  id: string;
  embedding: Float32Array;
}

export const MID_BAND_LOW = 0.55;
export const MID_BAND_HIGH = 0.80;
export const MAX_CLUSTER_SIZE = 4;
export const MAX_CLUSTERS = 10;

/**
 * Returns up to MAX_CLUSTERS clusters of 2-4 item IDs each. A pair is
 * eligible if its cosine ∈ [MID_BAND_LOW, MID_BAND_HIGH]. A cluster is
 * the connected component formed by repeatedly extending an in-band
 * pair with a third/fourth member that is in-band with EVERY existing
 * member (transitive in-band, not just one).
 *
 * Greedy: starts with the highest-cosine in-band pair, extends until
 * no further member is in-band with all current members or size hits
 * MAX_CLUSTER_SIZE, removes those items from the pool, repeats.
 */
export function findMidBandClusters(
  items: readonly ClusterItem[],
  opts?: {
    low?: number;
    high?: number;
    maxClusterSize?: number;
    maxClusters?: number;
  },
): string[][] {
  const low = opts?.low ?? MID_BAND_LOW;
  const high = opts?.high ?? MID_BAND_HIGH;
  const maxSize = opts?.maxClusterSize ?? MAX_CLUSTER_SIZE;
  const maxClusters = opts?.maxClusters ?? MAX_CLUSTERS;

  if (items.length < 2) return [];

  // Pre-compute pairwise similarities; index by item id.
  const sims = new Map<string, Map<string, number>>();
  for (const it of items) sims.set(it.id, new Map());
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = cosine(items[i].embedding, items[j].embedding);
      sims.get(items[i].id)!.set(items[j].id, s);
      sims.get(items[j].id)!.set(items[i].id, s);
    }
  }

  const inBand = (a: string, b: string) => {
    const s = sims.get(a)!.get(b);
    return s !== undefined && s >= low && s <= high;
  };

  const used = new Set<string>();
  const clusters: string[][] = [];

  // Collect all in-band pairs, sorted by similarity descending. We
  // prefer to seed from the strongest mid-band pair first.
  const pairs: Array<{ a: string; b: string; s: number }> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = sims.get(items[i].id)!.get(items[j].id)!;
      if (s >= low && s <= high) {
        pairs.push({ a: items[i].id, b: items[j].id, s });
      }
    }
  }
  pairs.sort((x, y) => y.s - x.s);

  for (const { a, b } of pairs) {
    if (clusters.length >= maxClusters) break;
    if (used.has(a) || used.has(b)) continue;

    const cluster = [a, b];
    used.add(a);
    used.add(b);

    // Try to extend.
    while (cluster.length < maxSize) {
      let bestCand: string | null = null;
      let bestMinSim = -Infinity;
      for (const it of items) {
        if (used.has(it.id)) continue;
        // Must be in-band with EVERY current member.
        if (!cluster.every((m) => inBand(it.id, m))) continue;
        // Tie-break: pick the candidate whose weakest link to the
        // cluster is strongest — keeps clusters tight.
        const minSim = Math.min(...cluster.map((m) => sims.get(it.id)!.get(m)!));
        if (minSim > bestMinSim) {
          bestMinSim = minSim;
          bestCand = it.id;
        }
      }
      if (!bestCand) break;
      cluster.push(bestCand);
      used.add(bestCand);
    }

    clusters.push(cluster);
  }

  return clusters;
}
