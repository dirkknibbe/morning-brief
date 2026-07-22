---
date: 2026-07-22
classification: research
action: Run `npx mcpgrade --stdio` against the UIPE MCP server; if descriptions score below A, fix them and use the A grade as an MCPAASTA trust signal.
source_brief: briefs/2026-07-22.md
---

## TL;DR
`mcpgrade` is real (npm v0.1.0, by Teng Li / TengByte) — "Lighthouse for MCP servers": it lints tool descriptions, schemas, naming, and token cost for *agent usability*, not spec compliance. Descriptions are 30% of the A–F score. I read UIPE's actual tool definitions (`packages/core/src/mcp/server.ts`): the descriptions are already strong — full sentences covering what/when/what-returns, plus injection-safety notes. You are very likely already at A on descriptions; the real risk to the overall grade is **schema design** (also 30%) and **token cost**, not descriptions. This is a 15-minute run, not a morning. Do it, screenshot the report, and bank the badge.

## Key findings
- mcpgrade weights: Descriptions 30%, Schema design 30%, Naming 15%, Token cost 15%, Consistency 10%. Scores are density-normalized (3 bad tools of 30 ≠ F). (source: https://github.com/TengByte/mcpgrade)
- Static lint (v0.1) is zero-config, no API key, runs in seconds. `--eval` (v0.2) does live LLM tool-selection testing but costs ~$0.05–0.2/server and needs `ANTHROPIC_API_KEY` — **not needed** for the description grade. (source: README)
- UIPE descriptions already follow the rubric: e.g. `navigate` — "Navigate to a URL and return the UI scene graph as compact text. Always call this first…" — what + when + returns, one+ sentence each. No placeholder/short-description smells visible. (source: /Users/dirkknibbe/uipe/ui-perception-engine/packages/core/src/mcp/server.ts:181)
- UIPE ships a stdio bin: `"uipe": "dist/src/mcp/index.js"`, script `mcp: node dist/src/mcp/index.js`. `dist/` is already built. (source: packages/core/package.json)
- mcpgrade v0.3 roadmap = GitHub Action + dynamic badges + **public leaderboard of popular MCP servers** — that leaderboard is the natural home for your "we grade A" MCPAASTA trust signal. (source: README roadmap)
- MCPAASTA is your own distribution thesis (recurring in briefs, e.g. 2026-07-20), not an existing public registry — so the "listing" is something you control; a grade badge is a credibility asset you'd place on it.

## Existing players / prior art
- mcpgrade — agent-usability linter, A–F — https://github.com/TengByte/mcpgrade
- mcp-lint — checks schema *parsing* across clients (Claude/Cursor/OpenAI strict); complementary, not competing — https://www.npmjs.com/package/mcp-lint

## Concrete next steps for Dirk
1. From `packages/core`: `pnpm build` (ensure dist fresh), then `npx mcpgrade --stdio "node dist/src/mcp/index.js"`. Note: server boots a browser/perception stack — if stdio hangs, use `--snapshot` on a saved `tools/list` dump instead.
2. Read the per-category bars. If **Descriptions = A**, screenshot it now — that's your MCPAASTA asset. If not, the findings list gives exact rule IDs + fixes (D0xx).
3. Add `mcpgrade --stdio "…" --fail-on error --json` as a CI gate so the grade can't regress. Park a badge/leaderboard task against mcpgrade v0.3 for the public listing.

## Open questions
- Does the stdio server complete a clean `tools/list` handshake without launching the full vision pipeline (ANTHROPIC_API_KEY / Ollama deps)? If not, `--snapshot` is the reliable path.
- Will the imported descriptions (`timelineTool.description`, `componentIndexTool.description`, perception-session tools) hold the same quality bar as the inline ones? Worth a glance if the grade dips below A.
