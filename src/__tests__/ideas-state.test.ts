import { test, expect } from "bun:test";
import { isSynthesisEligible } from "../ideas-state";

test("isSynthesisEligible accepts extracted/queued/parked with signal_strength >= 1 and synthesis_depth <= 1", () => {
  const base = { signal_strength: 1, synthesis_depth: 0, status: "extracted" as const };
  expect(isSynthesisEligible({ ...base })).toBe(true);
  expect(isSynthesisEligible({ ...base, status: "queued" })).toBe(true);
  expect(isSynthesisEligible({ ...base, status: "parked" })).toBe(true);
});

test("isSynthesisEligible rejects rejected/needs_human/building/built", () => {
  const base = { signal_strength: 5, synthesis_depth: 0, status: "rejected" as const };
  expect(isSynthesisEligible(base)).toBe(false);
  expect(isSynthesisEligible({ ...base, status: "needs_human" })).toBe(false);
  expect(isSynthesisEligible({ ...base, status: "building" })).toBe(false);
  expect(isSynthesisEligible({ ...base, status: "built" })).toBe(false);
});

test("isSynthesisEligible rejects signal_strength < 1", () => {
  expect(
    isSynthesisEligible({ signal_strength: 0, synthesis_depth: 0, status: "extracted" }),
  ).toBe(false);
});

test("isSynthesisEligible rejects synthesis_depth > 1 (depth-2 leaves cannot be parents)", () => {
  expect(
    isSynthesisEligible({ signal_strength: 5, synthesis_depth: 2, status: "extracted" }),
  ).toBe(false);
});
