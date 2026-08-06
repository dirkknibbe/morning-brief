---
date: 2026-08-06
classification: research
action: Read Interlock's write-up + "cannot catch" ledger, then map which byte-overlap taint checks could run inside UIPE's MCP proxy (temporal perception → perception + safety, as a paid tier)
source_brief: briefs/2026-08-06.md
---

## TL;DR
The action's framing has a category error worth catching before you spend build time: Interlock's byte-overlap check is a **sink-side egress proof**, and UIPE is a **source-side perception server** — it has no MCP proxy or wire to run the check on, so "fold it into UIPE's proxy" as literally stated doesn't have a place to land. **But** UIPE's `act` tool (type/navigate/clickSelector-with-value) *is* a real exfil sink, and that's the genuine fit: port Interlock's Variant-A "hold-before-forward" to gate `act` against a supplied taint set. That makes "your agent can see the page AND can't be hijacked into typing your secret into it" literally true, decidably, with no model on the hot path — which matches UIPE's deterministic-sensor thesis. Do that slice; skip the semantic injection-scanning pitch (brief line 27) — Interlock's own post is a 2000-word argument for why that's the unwinnable arms race.

## Key findings
- Interlock does **not** stop injection; it assumes injection won and proves *bytes moved* at the sink. Byte-overlap needs three things on the wire — a tainted **source**, **untrusted content**, and an **egress sink**. (source: https://yashwanthreddymali.com/blog/interlock-exfiltration-at-runtime/)
- Detection runs on two planes UIPE has neither of: an MCP **proxy** on the full JSON-RPC stream (Variant A) and an **eBPF syscall sensor** (Variant B). UIPE is one MCP server, not a proxy over the session. (source: Interlock blog + `~/uipe/ui-perception-engine` src — zero `proxy|jsonrpc|egress|taint` hits)
- UIPE = 12-tool perception+actuation server (navigate, get_scene, analyze_visual, compare_states, watch… and `act`). It **produces** untrusted content (page perception) and **actuates** the browser (`act`) — so it owns 2 of Interlock's 3 legs on its own surface; it's blind only to the sensitive **source**. (source: `~/uipe/docs/mcp-tools.md`)
- The portable part is decidable and cheap: Interlock's closed **13-encoding set** (literal, base64, hex, url_encoded, reversed, gzip_base64, brotli_base64, zstd_base64, lz4_base64…) + bounded depth-5 decode. No Go dependency needed — it's string work. (source: Interlock blog)
- The gap ledger transfers too: UIPE can't self-discover secrets (byte-overlap "has nothing to match" without a taint set — same as Interlock's blind-inference permanent gap). Paraphrase and non-UIPE sinks stay permanent gaps. (source: Interlock "structurally permanent" table)

## Existing players / prior art
- **Interlock** — runtime firewall, byte-overlap exfil proof, public gap ledger — https://yashwanthreddymali.com/blog/interlock-exfiltration-at-runtime/ (code + ledger on his GitHub)
- **MCP Defender** — OSS AI firewall for MCP in Cursor/Claude (proxy-style) — https://mcpdefender.com
- **Guardian Runtime** — local firewall for AI coding agents — pypi guardian-runtime

## Concrete next steps for Dirk
1. **Add an optional `taintSet` to a UIPE session** (secrets/patterns, operator-supplied). Port the 13 canonical encodings as a pure-TS `canonicalForms(secret)` helper — no model, no Interlock dep.
2. **Gate `act` before execution**: byte-overlap `type`/`navigate`/`clickSelector` args against `taintSet`; on hit return a structured refusal (mirror Interlock's JSON-RPC deny). Ship as opt-in **"safe-act"** mode — that's the paid tier.
3. **Tag perception output** `provenance: untrusted` on get_scene/analyze_visual so a downstream enforcer (or future MCPaaSTA gateway) can content-bind. Don't build the eBPF plane — declare it out of scope.
4. **Write UIPE's own gap ledger** (no-taint-set, paraphrase, non-UIPE sinks) *before* marketing "can't be hijacked." Interlock's honesty is the credibility.
5. **Reject** the semantic injection-scanner path — cite Interlock's own "arms race with no scoreboard."

## Open questions
- Where does `taintSet` come from in a real deploy — operator config, a companion secret-scanner, or does **MCPaaSTA** (hosted UIPE) become the natural spot to actually be a proxy and close the source-visibility gap?
- Is the paid-tier buyer someone already running an enforcement layer (UIPE = the tagging content plane) or someone with nothing (UIPE = standalone safe-act)? Different pitch, different scope.
