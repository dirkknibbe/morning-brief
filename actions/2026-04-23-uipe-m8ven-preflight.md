---
date: 2026-04-23
classification: research
action: Run UIPE through M8ven Preflight; turn surfaced OAuth/CORS gaps into a marketing asset.
source_brief: briefs/2026-04-23.md
---

## TL;DR

The action as written can't execute — UIPE's MCP server uses **stdio transport** (`src/mcp/index.ts:StdioServerTransport`), and M8ven Preflight only probes **deployed Streamable HTTP endpoints** ("Your deployed Streamable HTTP endpoint. OAuth tested if present."). There is no URL to paste. Worse, UIPE is fundamentally local-first — it drives the user's Playwright browser — so a hosted version opens a security rabbit hole (remote code driving a browser with live session cookies) that a 15-second scanner won't help you think through. **Don't chase the Preflight badge yet.** Instead, either (a) spin up a 30-line Hono stub with fake tools, run *that* through Preflight, and write the content asset from the stub's failure modes; or (b) reframe the asset as "why UIPE ships as stdio, and what the remote-MCP threat model actually looks like." Both are cheaper than porting UIPE and produce a sharper story.

## Key findings

- **Preflight is Streamable-HTTP-only.** Tests OAuth 2.1 + PKCE (dynamic client registration, auto-approve, token exchange, refresh), CORS, MCP protocol over SHTTP (initialize/tools/list/tools/call), OpenAI's `/.well-known/openai-apps-challenge` file, anonymous fallback. (source: https://m8ven.com/preflight)
- **UIPE is stdio.** `StdioServerTransport` wired in `~/uipe/ui-perception-engine/src/mcp/index.ts`; 11 tools (navigate, get_scene, act, watch, etc.) all assume a local Playwright process. No HTTP layer, no auth, no CORS surface. (source: repo read)
- **MCP spec still recommends stdio when possible** — "Clients SHOULD support stdio whenever possible." Streamable HTTP is for servers needing multi-client remote access. (source: https://modelcontextprotocol.io/docs/concepts/transports)
- **Directory listing is the whole point of Preflight** — "Claude and OpenAI directories require [OAuth] for listed MCPs. Anonymous-only servers can still work via direct connection, but won't get listed." UIPE's ICP is devs running it locally against Claude Code, not random users discovering it in a directory.
- **Preflight's FAQ leaks the common gaps** — authorize endpoints that redirect to a browser login page (fatal: "MCP clients are machines"); token endpoints that only accept JSON instead of `application/x-www-form-urlencoded` (breaks OpenAI). Useful content fodder even without running the scan.
- **Review latency is the moat Preflight is selling against** — "OpenAI: 2-4 weeks. Claude: varies." A Preflight pass says nothing about actually getting listed; it just avoids a silent rejection.

## Existing players / prior art

- M8ven Preflight — free scanner → paid Trust Index listing → enterprise verified tier — https://m8ven.com/preflight
- MCP TypeScript SDK — `StreamableHTTPServerTransport` is the official path if you ever need remote — https://modelcontextprotocol.io/docs/concepts/transports
- Fastmail `api.fastmail.com/mcp` (per today's brief) — a clean example of a remote MCP shipped as "another API"

## Concrete next steps for Dirk

1. **Skip submitting UIPE.** Nothing to submit; don't build a Playwright-over-HTTP server to satisfy a scanner that was never meant for it.
2. **Write the essay instead (≤2hr):** "Your MCP doesn't need to be remote — and here's the threat model Preflight can't check for you." Use Preflight's FAQ gotchas as the concrete anchor. That's the marketing asset today's brief wanted.
3. **If still itching for the badge (≤1hr):** stand up a throwaway `hono` server with `/mcp` returning a single stub tool, deploy to Vercel, run it through Preflight, screenshot the result. You learn the actual failure taxonomy on a disposable target — not UIPE.
4. **Park the remote-UIPE question.** Revisit only if a paying design-partner asks for hosted inference against their own URLs — then the threat model changes.

## Open questions

- Does Claude Code's directory (when it exists) list stdio servers at all, or only remote? Preflight implies remote-only, but the brief doesn't confirm Claude's policy.
- Is there a Preflight-equivalent for stdio MCPs (e.g. a local conformance harness)? None surfaced in 15 minutes of looking — possible gap worth a separate spark.
