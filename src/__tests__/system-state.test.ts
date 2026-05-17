import { test, expect } from "bun:test";
import { canRun, type SystemState } from "../system-state";

const baseState: SystemState = {
  frozen: false,
  extract_enabled: true,
  synthesize_enabled: true,
  triage_enabled: true,
  factory_enabled: true,
  freeze_reason: null,
  updated_at: new Date(),
  updated_by: "test",
};

test("canRun: all stages run when nothing frozen and all enabled", () => {
  expect(canRun(baseState, "extract")).toBe(true);
  expect(canRun(baseState, "synthesize")).toBe(true);
  expect(canRun(baseState, "triage")).toBe(true);
  expect(canRun(baseState, "factory")).toBe(true);
});

test("canRun: frozen=true blocks every stage even if enabled", () => {
  const frozen = { ...baseState, frozen: true };
  expect(canRun(frozen, "extract")).toBe(false);
  expect(canRun(frozen, "synthesize")).toBe(false);
  expect(canRun(frozen, "triage")).toBe(false);
  expect(canRun(frozen, "factory")).toBe(false);
});

test("canRun: per-stage disable only affects that stage", () => {
  const noExtract = { ...baseState, extract_enabled: false };
  expect(canRun(noExtract, "extract")).toBe(false);
  expect(canRun(noExtract, "synthesize")).toBe(true);
  expect(canRun(noExtract, "triage")).toBe(true);
  expect(canRun(noExtract, "factory")).toBe(true);
});

test("canRun: factory disable independent of others", () => {
  const noFactory = { ...baseState, factory_enabled: false };
  expect(canRun(noFactory, "extract")).toBe(true);
  expect(canRun(noFactory, "factory")).toBe(false);
});
