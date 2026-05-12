import { test, expect } from "bun:test";
import { parseIdeasFromBrief, parseIdeasFromAction } from "../parse-ideas";

test("parseIdeasFromBrief: extracts Opportunity Sparks bullets", () => {
  const md = `intro paragraph

💡 *Opportunity Sparks*
- MCP auth bridge — connect OAuth flows to MCP servers
- Browser agent eval harness — Selenium-free testing for agents

🔥 *Hot Signals*
- something else
`;
  const result = parseIdeasFromBrief(md, "briefs/2026-04-09.md");
  const sparks = result.filter((r) => r.source_section === "Opportunity Sparks");
  expect(sparks.length).toBe(2);
  expect(sparks[0].raw_text).toContain("MCP auth bridge");
  expect(sparks[1].raw_text).toContain("Browser agent eval");
  expect(sparks[0].source_file).toBe("briefs/2026-04-09.md");
});

test("parseIdeasFromBrief: extracts Action for today line", () => {
  const md = `intro

**Action for today:** Build a tiny MCP auth proxy that handles OAuth for one provider.

next paragraph
`;
  const result = parseIdeasFromBrief(md, "briefs/2026-04-09.md");
  const actions = result.filter((r) => r.source_section === "Action for today");
  expect(actions.length).toBe(1);
  expect(actions[0].raw_text).toContain("MCP auth proxy");
});

test("parseIdeasFromBrief: tolerates emoji-prefixed Action variant", () => {
  const md = `🎯 **Action item for today:** Ship a one-pager for X.

end
`;
  const result = parseIdeasFromBrief(md, "briefs/2026-04-10.md");
  expect(result.some((r) => r.source_section === "Action for today")).toBe(true);
});

test("parseIdeasFromBrief: returns [] when no sparks/action present", () => {
  const md = "Just random text\n\nNo special sections.";
  expect(parseIdeasFromBrief(md, "briefs/empty.md")).toEqual([]);
});

test("parseIdeasFromAction: extracts Concrete next steps as numbered items", () => {
  const md = `## TL;DR
something

## Concrete next steps for Dirk
1. Write a smoke test against the public MCP server
2. Wire OAuth flow to a ngrok-tunneled callback URL
3. Document gotchas

## Open questions
- foo
`;
  const result = parseIdeasFromAction(md, "actions/2026-04-09-test.md");
  expect(result.length).toBe(3);
  expect(result[0].raw_text).toContain("smoke test");
  expect(result[2].raw_text).toContain("Document gotchas");
  expect(result[0].source_section).toBe("Concrete next steps");
});

test("parseIdeasFromAction: returns [] when no steps section present", () => {
  const md = "## TL;DR\nsomething\n\n## Open questions\n- foo";
  expect(parseIdeasFromAction(md, "actions/x.md")).toEqual([]);
});

test("parseIdeasFromBrief: title is truncated short summary of raw_text", () => {
  const md = `💡 *Opportunity Sparks*
- MCP auth bridge — connect OAuth flows to MCP servers for first-class agent authentication
`;
  const result = parseIdeasFromBrief(md, "briefs/x.md");
  expect(result[0].title.length).toBeLessThanOrEqual(80);
  expect(result[0].title).toContain("MCP auth bridge");
});

test("parseIdeasFromBrief: extracts numbered Opportunity Sparks bullets", () => {
  // Real briefs use both dash and numbered formats. Both must work.
  const md = `💡 *Opportunity Sparks*
1. *WordPress MCP safety layer* — pre-execution guard for destructive ops
2. *Agent-spend refund API* — bookkeeping for failed agent operations
3. *Per-tool MCP audit + insurance* — risk pricing for risky tool calls

🔥 *Hot Signals*
- something else
`;
  const result = parseIdeasFromBrief(md, "briefs/2026-04-08.md");
  const sparks = result.filter((r) => r.source_section === "Opportunity Sparks");
  expect(sparks.length).toBe(3);
  expect(sparks[0].raw_text).toContain("WordPress MCP safety layer");
  expect(sparks[2].raw_text).toContain("Per-tool MCP audit");
});
