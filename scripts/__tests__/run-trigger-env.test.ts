import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../run-trigger.sh", import.meta.url), "utf8");

test("run-trigger honors SKIP_DEDUPE to bypass the 21h guard", () => {
  expect(SRC).toContain('if [ "${SKIP_DEDUPE:-0}" != "1" ]; then');
  const guardIdx = SRC.indexOf("SKIP_DEDUPE");
  const exitIdx = SRC.indexOf("(< 21h), skipping");
  expect(guardIdx).toBeGreaterThanOrEqual(0);
  expect(exitIdx).toBeGreaterThan(guardIdx);
});

test("run-trigger budget is overridable via MAX_BUDGET_USD with a $5 default", () => {
  expect(SRC).toContain('--max-budget-usd "${MAX_BUDGET_USD:-5}"');
});
