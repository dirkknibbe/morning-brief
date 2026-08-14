---
date: 2026-08-14
classification: build-plan
action: Steal mcp-stama's playbook — build a RAM/cold-start/latency table for UIPE's MCP server vs a stock Node reference, as the HN post + pricing justification.
source_brief: briefs/2026-08-14.md
---

## TL;DR
The literal action is a trap. UIPE's MCP server is a **Node process that drives Playwright + a vision model** (OmniParser Python sidecar, `@anthropic-ai/sdk`, `sharp`, a Rust optical-flow binary). On mcp-stama's own axes — idle RAM, cold-start, tool-call latency — UIPE is the *fattest* class of MCP server, not the leanest. Publish that table honestly and it undercuts your pricing; publish it dishonestly (hiding the browser+vision cost) and HN eats you alive. **Don't build the table as framed.** Build the honest inversion: the leanness UIPE actually sells is on the *client* side — MCPaaSTA moves a ~GB browser+vision stack off the agent's machine. That's the real HN post and the real pricing justification.

## Key findings
- UIPE's MCP server runs `node dist/src/mcp/index.js`; deps include `playwright`, `sharp`, `@anthropic-ai/sdk`, plus an OmniParser sidecar and Rust flow binary (source: packages/core/package.json, packages/core/src/mcp/server.ts).
- mcp-stama competes on <10MB RAM / sub-ms calls vs "Node 200MB+, 1–3s wake" (source: briefs/2026-08-14.md). A UIPE `perceive` call is browser+model-bound — hundreds of ms to seconds. Racing an echo server on latency is a category error you lose.
- The hosted product (MCPaaSTA) already frames value as **offloading infra**: agents "get temporal perception without running Playwright, vision models, or any local infrastructure" (source: docs/superpowers/specs/2026-04-14-mcpaasta-design.md).
- Pricing is justified by amortization + ops offload (Fly.io per-session, free tier for PMF), not raw binary size (spec D2/D13). The table should show self-host TCO vs per-call price, not MB-vs-MB.

## Existing players / prior art
- mcp-stama — static Rust MCP binary, leanness pitch — the playbook being copied (brief; repo not locatable via GitHub search).
- Browserbase / Browserless — hosted headless-browser-as-a-service; the *correct* incumbent comparison for MCPaaSTA's client-offload story — url: browserbase.com.
- Surfil — on-device agent control plane, opposite bet (local) — (brief).

## Concrete next steps for Dirk
1. **Kill the framed table.** No "UIPE MCP binary RAM vs stock Node." You lose every axis and omitting browser+vision is dishonest.
2. **Build the client-footprint table instead** — 3 columns: (a) stock Node echo MCP, (b) self-host UIPE perception locally, (c) agent → MCPaaSTA remote. Rows: local RAM, cold-start→first result, disk (chromium+model download), ops burden. Punchline: "we took ~1GB off your laptop." *That* is the HN post.
3. **First PR (pure measurement, no product change):** a `packages/core/bench/` harness that records (i) server RSS at idle, (ii) spawn→first `tools/list`, (iii) cold vs warm time→first `get_scene`/`perceive` result. Emit JSON + a markdown table. Both the HN post and pricing page consume this artifact.
4. **Reframe pricing** as offloaded TCO (Fly.io per-session amortized across users), per spec D13's free-tier PMF split — not "we're 10MB."

## Open questions
- Do the Rust `uipe-vision` crate + optical-flow binary enable a genuinely browser-free *local* perception path? If so, that variant could play mcp-stama's leanness game honestly — worth a spike.
- What is real warm per-tool latency (is `get_scene` <200ms or multi-second)? Needed before any latency claim ships.
- Is the MCPaaSTA client curl-tier (just a URL in MCP config), making the client-footprint column near-zero as the pitch assumes?
