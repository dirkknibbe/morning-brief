---
date: 2026-04-17
classification: research
action: 30-min competitive teardown of Kampala (YC W26) to sharpen UIPE positioning
source_brief: briefs/2026-04-17.md
---

## TL;DR
Kampala is a Mac-only MITM proxy + MCP + agent harness (by Zatanna, YC W26) that turns live HTTP/S/gRPC/WS workflows into replayable APIs. Their real moat is TLS/HTTP2 fingerprint preservation (Go ecosystem, bogdann-finn's tls-client) plus an opinionated agent harness — not the proxy itself. Pricing is opaque ("book a demo"); macOS download is free, revenue likely comes from hosted workflow runs. Three concrete soft spots for UIPE to lean into: **no SSL pinning / no mTLS / no HTTP/3**, **Mac-only**, and **no coverage where the network layer has nothing to intercept** (canvas/WebGL, Electron with obfuscated IPC, offline-first apps, cross-app drag/drop). Positioning shouldn't be "UIPE beats Kampala" — it should be "Kampala owns the wire, UIPE owns everything the wire can't see," with an explicit handoff story.

## Key findings
- Protocol coverage: HTTP/1.1, HTTP/2, gRPC (founder admits "a bit sketch/hard"), WebSocket. **No HTTP/3, no TCP fingerprinting.** (source: https://news.ycombinator.com/item?id=47794514)
- SSL pinning = hard blocker. ChatGPT mobile + many iOS apps break on proxy. Founder recommends Frida / mitmproxy AVD for Android; no first-party fix. (source: HN thread, IMTDb comment + reply)
- Auth: intercepts session cookies/tokens and replays; auto-retry + re-auth. No story yet for device-bound tokens, passkeys, mTLS, or TOTP/hardware-key MFA. (source: HN Caido co-founder exchange + Zatanna site FAQ)
- Distribution: free macOS download, Windows waitlist, no Linux, no cloud build. Feeds enterprise "book a demo" funnel for hosted runs. (source: https://www.zatanna.ai/kampala)
- Founder DNA: Alex Blackwell — 7-8 yrs sneaker/ticket/sportsbook integrations. This is an *anti-anti-bot* company cosplaying as an API company. That's their competence and their ceiling. (source: HN self-intro)
- Interface surface: both an "agent harness" (prompts you through a workflow) **and** an MCP server that external coding agents call to build scripts. MCP is the durable part — script export and optional hosting round it out. (source: HN post body)
- Alt-stack to watch: Caido (Rust, vuln-repro focus) is an adjacent competitor already shipping similar auth-chain tracing. (source: HN Sytten comment)
- Prior art / HN workarounds: one commenter one-shot this with HAR → OpenAPI → Playwright for auth + Python MCP in an hour. That's the open-source ceiling UIPE + Kampala both compete against. (source: HN ksri comment)

## Existing players / prior art
- **Caido** — Rust MITM for vulnerability PoC reproduction, similar auth-chain focus — https://caido.io
- **mitmproxy** — open-source baseline; does AVD for Android SSL-pin bypass — https://mitmproxy.org
- **Autonoma** — mobile QA via native XCUITest layer (bypasses pinning by design) — https://www.getautonoma.com
- **adam-s/intercept** — self-tuning Claude recursion over Chrome DevTools Protocol, OSS — https://github.com/adam-s/intercept
- **Browserbase / Arcade / Apify** — browser-layer automation; Kampala's whole pitch is "don't use these"

## Concrete next steps for Dirk
1. **Write a 1-page "UIPE vs Kampala" positioning note** on the UIPE site before W26 Demo Day (late April). Lead with three scenarios Kampala cannot serve: SSL-pinned mobile apps, canvas/WebGL UIs (Figma-likes), and cross-app orchestration. Name Kampala directly — don't be coy.
2. **Ship one "Kampala can't do this" demo video** this weekend. Strongest candidate: an SSL-pinned banking/fintech mobile app or a Figma-class canvas tool. Even a 90-second screen recording posted as a reply to the Launch HN thread buys relevance adjacency.
3. **Prototype a UIPE→Kampala handoff adapter** instead of competing head-on. UIPE captures the UI intent + element semantics; when a clean network call exists, hands the recorded trace to Kampala's MCP for replay. Frames UIPE as the *observability* half Kampala lacks and sidesteps a zero-sum fight while their TLS work is still their moat.
4. **DM Alex Blackwell (alex at zatanna.ai) only after** steps 1-2 are public. Opening with a demo + positioning doc beats opening cold.

## Open questions
- Kampala's actual pricing (free vs. hosted-run SKU) — only discoverable via demo call or Discord.
- Whether they'll add SSL pinning / HTTP/3 / mTLS in the next 6 months, or intentionally punt to stay macOS-desktop-first.
- Whether Zatanna views UI-layer tools as complementary or competitive — partnership appetite is unknown.
