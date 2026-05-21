import { test, expect } from "bun:test";
import {
  isValidStatus,
  isValidTransition,
  assertValidTransition,
  IllegalTransitionError,
  ALLOWED_TRANSITIONS,
  ALL_STATUSES,
} from "../status";

test("isValidStatus: accepts known statuses", () => {
  for (const s of ALL_STATUSES) {
    expect(isValidStatus(s)).toBe(true);
  }
});

test("isValidStatus: rejects unknown statuses", () => {
  expect(isValidStatus("unknown")).toBe(false);
  expect(isValidStatus("")).toBe(false);
  expect(isValidStatus("extracted ")).toBe(false);
});

test("isValidTransition: extracted → queued is allowed", () => {
  expect(isValidTransition("extracted", "queued")).toBe(true);
});

test("isValidTransition: extracted → built is rejected", () => {
  expect(isValidTransition("extracted", "built")).toBe(false);
});

test("isValidTransition: built is terminal — no transitions out", () => {
  for (const to of ALL_STATUSES) {
    expect(isValidTransition("built", to)).toBe(false);
  }
});

test("isValidTransition: rejected is terminal — no transitions out", () => {
  for (const to of ALL_STATUSES) {
    expect(isValidTransition("rejected", to)).toBe(false);
  }
});

test("isValidTransition: parked can be revived to queued or rejected", () => {
  expect(isValidTransition("parked", "queued")).toBe(true);
  expect(isValidTransition("parked", "rejected")).toBe(true);
  expect(isValidTransition("parked", "building")).toBe(false);
});

test("assertValidTransition: throws IllegalTransitionError on illegal", () => {
  expect(() => assertValidTransition("extracted", "built")).toThrow(IllegalTransitionError);
});

test("IllegalTransitionError carries from/to/allowed for callers", () => {
  try {
    assertValidTransition("extracted", "built");
    throw new Error("should have thrown");
  } catch (e: any) {
    expect(e).toBeInstanceOf(IllegalTransitionError);
    expect(e.from).toBe("extracted");
    expect(e.to).toBe("built");
    expect(e.allowed).toEqual(ALLOWED_TRANSITIONS.extracted);
    expect(e.message).toContain("extracted");
    expect(e.message).toContain("built");
  }
});

test("assertValidTransition: silent on legal", () => {
  expect(() => assertValidTransition("extracted", "queued")).not.toThrow();
});
