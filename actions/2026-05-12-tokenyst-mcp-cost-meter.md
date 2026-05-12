---
date: 2026-05-12
classification: build-plan
action: Clone Tokenyst and read how it intercepts the Anthropic SDK — find the seam where a generic MCP cost-meter could live.
source_brief: briefs/2026-05-12.md
---

## TL;DR

The action's premise is wrong: **Tokenyst does not intercept the Anthropic SDK**. It installs a `Stop` hook in `~/.claude/settings.json` that runs `tkst record-turn` after every Claude Code turn, then parses the session JSONL transcript in `~/.claude/projects/` to extract token counts. That seam is Claude-Code-specific — it doesn't generalize to "any MCP client." A real generic MCP cost-meter has to live somewhere else: either an Anthropic SDK middleware wrapper, an MCP transport proxy, or an HTTP-level proxy in front of the Messages API. The 1-day prototype is still viable, but at a different layer than the brief implied.

## Key findings

- **Tokenyst is a Claude Code budget tracker, not an SDK interceptor.** README "How It Works" section explicitly says it spawns Claude with inherited stdio, then parses transcript files on Stop. (source: https://raw.githubusercontent.com/jher7/tokenyst/master/README.md)
- **Mechanism is a Stop hook + JSONL parse.** `src/lib/hook-installer.ts` writes `{ type: 'command', command: 'tkst record-turn' }` into `settings.json` under `hooks.Stop`. (source: https://raw.githubusercontent.com/jher7/tokenyst/master/src/lib/hook-installer.ts)
- **Cost math is offline.** `src/lib/pricing.ts` holds Claude model rates including cache multipliers; `jsonl-parser.ts` (~7.5kb) does the math after-the-fact from transcript token fields. No live wire-tap. (source: https://api.github.com/repos/jher7/tokenyst/contents/src/lib)
- **No direct prior art for a generic "MCP cost meter."** GitHub search for `mcp cost meter proxy` returns zero repos. Whitespace exists — but it's also possible nobody's built it because the cost is just LLM tokens, which any existing token-tracker already counts. (source: https://github.com/search?q=mcp+cost+meter+proxy)
- **MCP "cost" is mostly LLM-side, not server-side.** MCP servers are typically free; the meter that matters is "tokens spent reading tool results." That's a tokenizer + middleware problem, not a protocol problem.

## Existing players / prior art

- **Tokenyst** — Claude Code session budget tracker via Stop hook + JSONL parsing — https://github.com/jher7/tokenyst
- **ccusage** (not searched, common in this space) — community Claude Code usage CLI; same JSONL-parse approach
- **Helicone / LangSmith / Langfuse** — HTTP-proxy observability for LLM APIs; closest commercial analog, but heavy and not MCP-aware
- **Anthropic SDK `messages.create`** — natively returns `usage` (input/output/cache tokens) per call. Anyone writing a thin wrapper gets free token accounting; the only missing piece is per-tool attribution.

## Concrete next steps for Dirk

1. **Drop the "patch Tokenyst" framing.** The seam doesn't exist there. Don't fork it.
2. **Pick the layer.** Three real options, in increasing generality:
   - (a) **Anthropic SDK wrapper** — re-export `Anthropic` class with a `messages.create` override that tokenizes each `tool_use`/`tool_result` block, attributes cost to MCP server name (parsed from tool name). 1-day prototype. Works for any direct-SDK user. Doesn't capture Claude Code traffic.
   - (b) **MCP stdio transport proxy** — sit between client and MCP server, count bytes/tokens of tool results before they reach the client. Generic across clients. Doesn't see the LLM call cost, only the result size.
   - (c) **HTTP reverse proxy** in front of `api.anthropic.com` — sees everything including streaming. Most invasive, but client-agnostic.
3. **Validate the demand.** Before building, ask: who's actually overspending on MCP-heavy workflows? Tokenyst's existence (4 stars) suggests Claude Code users want per-task budgets, not per-MCP-server attribution. If nobody's complaining, the prototype solves nothing.
4. **If you build (a):** model the API as `withCostMeter(anthropicClient, { onTurn: (cost) => ... })`. Ship as `@dirkdevelops/mcp-meter` on npm. README leads with "Tokenyst, but per-MCP-server and SDK-agnostic."

## Open questions

- Does Claude Code expose the MCP-server name when emitting tool_use blocks, or just the prefixed tool name? Need to confirm against an actual JSONL transcript before claiming "attribution" is free.
- Is "cost per MCP server" actually the metric people want, or is it "cost per tool call" / "cost per session"? Different UX, different value prop.
- Would this be more useful as a feature inside an existing observability tool (Langfuse) than as a standalone CLI?
