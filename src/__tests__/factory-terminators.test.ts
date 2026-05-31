import { test, expect } from "bun:test";
import {
  isCapped,
  failingStagnant,
  maxPairwiseCosine,
  decideStuck,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_MAX_MS,
} from "../factory-terminators";

function v(...nums: number[]): Float32Array {
  const a = new Float32Array(nums);
  let n = 0;
  for (const x of a) n += x * x;
  const len = Math.sqrt(n);
  if (len === 0) return a;
  for (let i = 0; i < a.length; i++) a[i] /= len;
  return a;
}

test("isCapped: false under both limits, true over either", () => {
  expect(isCapped(5, 60_000)).toBe(false);
  expect(isCapped(DEFAULT_MAX_ROUNDS + 1, 0)).toBe(true);
  expect(isCapped(1, DEFAULT_MAX_MS + 1)).toBe(true);
});

test("isCapped: respects custom opts", () => {
  expect(isCapped(3, 0, { maxRounds: 2 })).toBe(true);
  expect(isCapped(0, 100, { maxMs: 50 })).toBe(true);
});

test("failingStagnant: true when no decrease across the window", () => {
  expect(failingStagnant([3, 3, 3, 3, 3])).toBe(true);
  expect(failingStagnant([3, 4, 5, 6, 7])).toBe(true);
});

test("failingStagnant: false when a decrease (progress) occurs in the window", () => {
  expect(failingStagnant([3, 3, 2, 3, 3])).toBe(false);
  expect(failingStagnant([5, 4, 3, 2, 1])).toBe(false);
});

test("failingStagnant: false when fewer than window rounds", () => {
  expect(failingStagnant([3, 3, 3])).toBe(false);
});

test("maxPairwiseCosine: ~1 for near-identical vectors, low for orthogonal", () => {
  expect(maxPairwiseCosine([v(1, 0, 0), v(1, 0, 0)])).toBeCloseTo(1, 5);
  expect(maxPairwiseCosine([v(1, 0, 0), v(0, 1, 0)])).toBeCloseTo(0, 5);
});

test("decideStuck: true when failing is stagnant AND hypotheses are near-duplicates", () => {
  const failing = [3, 3, 3, 3, 3];
  const vecs = [v(1, 0, 0), v(1, 0, 0), v(0.99, 0.14, 0), v(1, 0, 0), v(0.98, 0.2, 0)];
  expect(decideStuck(failing, vecs)).toBe(true);
});

test("decideStuck: false when hypotheses are diverse even if failing is stagnant", () => {
  const failing = [3, 3, 3, 3, 3];
  const vecs = [v(1, 0, 0), v(0, 1, 0), v(0, 0, 1), v(1, 1, 0), v(0, 1, 1)];
  expect(decideStuck(failing, vecs)).toBe(false);
});

test("decideStuck: false when progress is being made regardless of hypotheses", () => {
  const failing = [5, 4, 3, 2, 1];
  const vecs = [v(1, 0, 0), v(1, 0, 0), v(1, 0, 0), v(1, 0, 0), v(1, 0, 0)];
  expect(decideStuck(failing, vecs)).toBe(false);
});
