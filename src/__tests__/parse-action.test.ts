import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAction, parseActionFromBody } from "../parse-action";

const PATH = "briefs/test.md";

test("parses the 2026-06-10 marker variant (*Action today:*)", () => {
  const body =
    "Intro line.\n\n*Action today:* Read withlore.ai's gateway + recall-tool design — map their pricing wedge.\n\nfooter\n";
  expect(parseActionFromBody(body, PATH)).toBe(
    "Read withlore.ai's gateway + recall-tool design — map their pricing wedge.",
  );
});

test("parses the 2026-06-12 marker variant (🎯 *Today's action:*)", () => {
  const body =
    "🔥 *Hot Signals*\n• stuff\n\n🎯 *Today's action:* `pip install state-harness`, wrap a 10-turn UIPE loop.\n";
  expect(parseActionFromBody(body, PATH)).toBe(
    "`pip install state-harness`, wrap a 10-turn UIPE loop.",
  );
});

test("regression: mid-prose bold emphasis containing 'action' does not match (2026-06-05 bug)", () => {
  const body =
    "*Lead:* The *agentic action* pattern trended today — tools everywhere.\n\nNo marker in this brief.\n";
  expect(() => parseActionFromBody(body, PATH)).toThrow(/No "Action today" block/);
});

test("bullet with action-bearing bold but no colon does not match", () => {
  const body = "• *Action replay for agents* — replay tooling for agent runs.\n";
  expect(() => parseActionFromBody(body, PATH)).toThrow();
});

test("captures continuation lines until the first blank line", () => {
  const body = "*Action today:* First line\nsecond line continues\n\nNot captured.\n";
  expect(parseActionFromBody(body, PATH)).toBe("First line\nsecond line continues");
});

test("double-asterisk bold marker works", () => {
  const body = "**Action today:** Do the thing.\n";
  expect(parseActionFromBody(body, PATH)).toBe("Do the thing.");
});

test("colon after the closing asterisks also counts", () => {
  const body = "*Action today*: Do the thing.\n";
  expect(parseActionFromBody(body, PATH)).toBe("Do the thing.");
});

test("parseAction reads <date>.md and prefers <date>-rerun.md", () => {
  const dir = mkdtempSync(join(tmpdir(), "briefs-"));
  writeFileSync(join(dir, "2026-06-10.md"), "*Action today:* base file\n");
  expect(parseAction("2026-06-10", dir).action).toBe("base file");
  writeFileSync(join(dir, "2026-06-10-rerun.md"), "*Action today:* rerun file\n");
  expect(parseAction("2026-06-10", dir).action).toBe("rerun file");
});

test("throws when no brief file exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "briefs-"));
  expect(() => parseAction("2026-01-01", dir)).toThrow(/No brief found/);
});
