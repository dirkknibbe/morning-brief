---
date: 2026-09-18
classification: research
action: Run UIPE through MCPJam's free local inspector/eval flow (`npx @mcpjam/inspector@latest`) to surface where a UI-perception server breaks across clients.
source_brief: briefs/2026-09-18.md
---

## TL;DR
Worth the afternoon. MCPJam is an open-source (Apache 2.0) MCP testing/eval platform whose headline feature — cross-client evals across 16 client configs (ChatGPT, Claude, Cursor, Copilot…) plus a Chrome-DevTools-style widget emulator — is almost purpose-built for "where does a *UI-perception* server render/behave differently per client." Local testing and the Evals feature are on the **free** tier, so the brief's "one afternoon, free" framing holds. One real gotcha: the hosted web app is HTTPS-URL-only, so to point it at UIPE (a local STDIO server) you must use the **terminal (`npx`)** or **desktop** build, not `app.mcpjam.com`. Do the terminal run first; only reach for the CLI/CI story if the interactive pass shows something worth gating.

## Key findings
- MCPJam bills itself as "the testing & evaluations platform for MCP server developers," explicitly framed around clients reading a server differently — exactly the observability angle in the action (source: https://raw.githubusercontent.com/MCPJam/inspector/main/README.md).
- **Free tier includes Evals + 30-day trace history**; Pro ($24/mo) only adds unlimited traces and 5k model credits. So the eval flow is genuinely free to try (source: https://www.mcpjam.com/pricing).
- **Playground widget emulator** supports OpenAI Apps SDK / MCP app UIs with Desktop/Tablet/Mobile, locale, CSP, light/dark, and safe-area toggles — directly relevant if UIPE emits UI (source: README).
- **Local STDIO is supported** by the terminal and desktop builds but *not* the hosted web app (HTTPS URLs only, "no STDIO"). This is the one setup constraint for UIPE (source: README "Install" section).
- Full JSON-RPC + trace timeline per tool call, plus a CLI/SDK/GitHub-Actions path for regression gating later — the "observability story" is real, not marketing (source: README, docs.mcpjam.com).

## Existing players / prior art
- **Official MCP Inspector** (`@modelcontextprotocol/inspector`) — the reference debugger MCPJam forks from; inspect-only, no cross-client evals — https://github.com/modelcontextprotocol/inspector
- **MCPJam Inspector** — the superset: cross-client evals, widget emulator, OAuth debugger, CI — https://github.com/MCPJam/inspector
- **MCPJam hosted app** — zero-install but HTTPS-only; not usable for local UIPE — https://app.mcpjam.com

## Concrete next steps for Dirk
1. Confirm UIPE's MCP transport (STDIO vs HTTP). If STDIO → use `npx @mcpjam/inspector@latest` and add UIPE as a STDIO server (its launch command). If it already serves HTTP, either build works.
2. Run one **Playground** session per UI-emitting tool: eyeball the widget in Desktop/Mobile and read the JSON-RPC trace for per-client divergence.
3. Turn the 2–3 cases that diverged into **Evals** test cases (expected tool call + assertion), run across the ChatGPT/Claude/Cursor client configs, and screenshot the accuracy table — that's the observability artifact.
4. Only if step 3 finds real regressions worth guarding: wire the MCPJam CLI into a GitHub Action. Don't do this pre-emptively.

## Open questions
- Do free-tier **Evals across 16 client configs** run on your own model keys, or do they consume the paid "credits" pool? Pricing implies model calls cost credits — worth checking before assuming a full 16-client sweep is free.
- Does UIPE's output register as an MCP "app UI"/widget the emulator can render, or only as text tool output? Determines whether the widget emulator adds value or you're just reading traces.
