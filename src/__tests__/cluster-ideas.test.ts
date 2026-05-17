import { test, expect } from "bun:test";
import { findMidBandClusters } from "../cluster-ideas";

// Helper to build a unit-length Float32Array.
function v(...nums: number[]): Float32Array {
  const a = new Float32Array(nums);
  let n = 0;
  for (const x of a) n += x * x;
  const len = Math.sqrt(n);
  if (len === 0) return a;
  for (let i = 0; i < a.length; i++) a[i] /= len;
  return a;
}

test("returns empty when fewer than 2 items", () => {
  const out = findMidBandClusters([{ id: "a", embedding: v(1, 0, 0) }]);
  expect(out).toEqual([]);
});

test("finds a 2-item cluster when their cosine is in [0.55, 0.80]", () => {
  // ~0.7 cosine — well inside the mid-band.
  const a = v(1, 0, 0);
  const b = v(0.7, 0.714, 0);
  const items = [
    { id: "alpha", embedding: a },
    { id: "beta", embedding: b },
  ];
  const out = findMidBandClusters(items);
  expect(out).toHaveLength(1);
  expect(out[0].sort()).toEqual(["alpha", "beta"]);
});

test("excludes pairs above 0.80 (near-duplicates)", () => {
  // ~0.95 cosine — too similar, should not cluster.
  const a = v(1, 0, 0);
  const b = v(0.95, 0.31, 0);
  const out = findMidBandClusters([
    { id: "a", embedding: a },
    { id: "b", embedding: b },
  ]);
  expect(out).toEqual([]);
});

test("excludes pairs below 0.55 (unrelated)", () => {
  // ~0.3 cosine — too unrelated.
  const a = v(1, 0, 0);
  const b = v(0.3, 0.954, 0);
  const out = findMidBandClusters([
    { id: "a", embedding: a },
    { id: "b", embedding: b },
  ]);
  expect(out).toEqual([]);
});

test("grows a 2-cluster to 3 if the third item is in-band with BOTH existing members", () => {
  // Three vectors mutually ~0.65 cosine.
  const a = v(1, 0, 0);
  const b = v(0.65, 0.76, 0);
  const c = v(0.65, 0.38, 0.66);
  const out = findMidBandClusters([
    { id: "a", embedding: a },
    { id: "b", embedding: b },
    { id: "c", embedding: c },
  ]);
  expect(out).toHaveLength(1);
  expect(out[0].sort()).toEqual(["a", "b", "c"]);
});

test("caps cluster size at 4", () => {
  // Build 5 mutually in-band vectors by perturbing a base vector.
  // We construct them analytically: each is a unit vector at the same
  // angle (~50°) from the next. Tight ring → all pairwise cosines ~0.64.
  const items = Array.from({ length: 5 }, (_, i) => {
    const theta = (i * Math.PI) / 4; // 45° apart
    return { id: `n${i}`, embedding: v(Math.cos(theta), Math.sin(theta), 0) };
  });
  const out = findMidBandClusters(items);
  // Every returned cluster must be size 2-4.
  for (const c of out) {
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c.length).toBeLessThanOrEqual(4);
  }
});

test("caps total returned clusters at 10", () => {
  // 25 random-ish items that all pairwise land in the mid-band by
  // construction: tiny rotations on a unit circle.
  const items = Array.from({ length: 25 }, (_, i) => {
    const t = (i * Math.PI) / 15;
    return { id: `i${i}`, embedding: v(Math.cos(t), Math.sin(t), 0) };
  });
  const out = findMidBandClusters(items);
  expect(out.length).toBeLessThanOrEqual(10);
});
