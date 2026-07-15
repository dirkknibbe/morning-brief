---
date: 2026-07-15
classification: build-plan
action: Test UIPE against a stateless MCP client; confirm it doesn't depend on Mcp-Session-Id or the initialize handshake, and migrate if it does (13-day deadline).
source_brief: briefs/2026-07-15.md
---

## TL;DR
The "hard July-28 deadline" in the brief is overstated FUD, but the underlying SEPs are real. UIPE is a **stdio-only** MCP server built entirely on `@modelcontextprotocol/sdk` (`StdioServerTransport` + `McpServer`) — it never touches the `Mcp-Session-Id` header (that's HTTP-transport-only) and hand-rolls **zero** handshake/session code. The `initialize` handshake it does use is owned by the SDK, and the stateless changes are backward-compatible via inline version negotiation. **Nothing breaks on 2026-07-28.** No migration to start now. The real (small) action item is: keep the SDK current and re-test when a stateless-capable SDK ships. Don't burn 13 days on a non-problem.

## Key findings
- UIPE serves MCP over **stdio only** — `index.ts` uses `new StdioServerTransport()`; `.mcp.json` launches it as `node …/index.js`. No HTTP/SSE/Streamable transport exists, so `Mcp-Session-Id` (an HTTP header) is structurally inapplicable. (source: `uipe/ui-perception-engine/packages/core/src/mcp/index.ts`)
- The "session" hits in `server.ts` are Playwright **browser** sessions + a `get_perception_session` tool — unrelated to MCP protocol sessions. (source: `…/src/mcp/server.ts`)
- SEP-2575 "Make MCP Stateless" is **Final** (created 2025-06-18) and *does* target stdio too — but it ships **Backward Compatibility / version negotiation**: `Client(vPrev) → Server(vPrev,vPost)` and `Client(vPrev,vPost) → Server(vPrev)` both work. Old servers keep working until clients drop the stateful version. (source: https://modelcontextprotocol.io/seps/2575-stateless-mcp)
- SEP-2567 (Sessionless via State Handles) and SEP-2243 (HTTP Header Standardization) are still **open / implementation-needed** as of 2026-07-14 — not shipped. (source: github.com/modelcontextprotocol/modelcontextprotocol issues #2883, #2875)
- Current released protocol version is **2025-11-25**; the versioning page lists **no 2026-07-28 revision**. The "protocol goes stateless on July 28" framing is not supported by the spec's own changelog. (source: https://modelcontextprotocol.io/specification/versioning)
- UIPE pins `@modelcontextprotocol/sdk: ^1.27.1`; latest is **1.29.0** — neither ships the stateless protocol yet. Migration = a dependency bump when it lands, not custom code. (source: registry.npmjs.org)
- `mcpsense-proxy` is **not findable on npm** — treat the brief's "it's a shipping product" claim as unverified hype. (source: npmjs.com search)

## Existing players / prior art
- SEP-2575 "Make MCP Stateless" — Final spec proposal; the authoritative source, not the proxy vendors — https://modelcontextprotocol.io/seps/2575-stateless-mcp
- SEP-2567 / SEP-2243 — in-flight sessionless + HTTP-header work, tracking issues open — github.com/modelcontextprotocol/modelcontextprotocol

## Concrete next steps for Dirk
1. **Close this action as "no migration needed."** UIPE has no session/handshake code of its own; the SDK owns it and the change is backward-compatible. Reclaim the 13 days.
2. Add a 5-min guard: `bun update @modelcontextprotocol/sdk` to 1.29.0, run the MCP smoke test, confirm still green. Low risk, keeps you near the moving edge.
3. Set a watch (not a fire drill) on SEP-2567/2243 landing in a *released* spec revision + a stateless-capable SDK. Only then do a real re-test — and only if you also add a remote/HTTP transport.
4. If/when UIPE gets a **remote HTTP** deployment, revisit — that's the only path where `Mcp-Session-Id` and stateless load-balancing actually matter.

## Open questions
- Is `mcpsense-proxy` a real product or brief-generated hype? Couldn't confirm it exists.
- What concrete event is pinned to "2026-07-28"? No spec revision matches; possibly a working-group target date, not a client cutover.
