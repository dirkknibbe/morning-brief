---
date: 2026-09-15
classification: research
action: Read Keydris' redeem.ts + middleware.ts and sketch how per-call token redemption maps to a per-call charge in UIPE
source_brief: briefs/2026-09-15.md
---

## TL;DR
Keydris' redemption *is* a per-call accounting chokepoint — one clean hook, no restructuring needed. But its value is the **credential vault**, not the meter. UIPE has no third-party secret to broker, so piggybacking Keydris means adopting the meter and deleting the vault — i.e. reimplementing 80% of an x402-MCP gateway that already exists off the shelf. Verdict: metering *can* piggyback the pattern structurally, but for **UIPE billing** it's the wrong fork. Use a ready x402-MCP shim for UIPE; fork Keydris only if the product is a *credential-brokering* metered gateway (the actual MCPAASTA wedge).

## Key findings
- The gateway `exchange()` POST is the single accounting point: on every `tools/call` it receives `{token, mcp action + intent-hash context, target(host,path,method)}` and **atomically consumes** the token. Everything a meter needs (subject, action, target, timestamp) is already on the wire. (source: src/keydris/redeem.ts)
- `initialize`/`tools/list` never hit the gateway — free browse, paid action. That maps 1:1 to freemium-per-call metering with zero extra plumbing. (source: src/keydris/middleware.ts)
- One token = one outbound call, enforced locally (`spent=true`) *and* atomically at the gateway. That's the double-spend guarantee any billing system needs, for free. (source: middleware.ts `KIT_SPEND_VAR`)
- The reader already surfaces gateway refusal as `{ok:false, problem: "HTTP <status>"}` on `!response.ok`. A **402 Payment Required** would flow through this path untouched — but the reader does *not* retry/pay, so inline x402 settlement needs an x402-aware fetch wrapper on the client side. (source: redeem.ts `exchange`)
- x402-for-MCP is a crowded, solved space — `civicteam/x402-mcp`, `Recall-Kitchen/awesome-x402-mcp-services` ("no accounts, pay per tool call"), aibtc, tip-md. The *metering + settlement* half is commodity. (source: github.com/search?q=x402+mcp+payment)

## The mapping (redemption → charge)
1. **Postpaid meter (lazy v0):** append a ledger row when the gateway releases credentials. No protocol change, invoice later. This is MCPAASTA metering in ~20 lines at the gateway.
2. **Prepaid inline (x402):** gateway returns HTTP 402 + payment requirements *before* releasing credentials; agent pays via facilitator, retries. Keydris' error path already carries the 402; only the client fetch loop is new.
3. **UIPE reality:** UIPE's cost is its *own* compute (screenshot/diff/token-measure), not a downstream credential. So the vault — Keydris' whole reason to exist — is dead weight. UIPE needs the meter, not the broker.

## Existing players / prior art
- civicteam/x402-mcp — x402 payment integration for MCP, drop-in — github.com/civicteam/x402-mcp
- Recall-Kitchen/awesome-x402-mcp-services — paid MCP tools, no accounts, x402 settlement — the "MCPAASTA rail" already shipping
- Keydris template — credential-vaulting single-use token gateway; the *only* differentiated half vs the above is the vault + intent-hash binding

## Concrete next steps for Dirk
1. **Don't fork Keydris for UIPE billing.** Wire UIPE tools' `tools/call` through an existing x402-MCP shim (start with `civicteam/x402-mcp`) — 30 min to a working prepaid meter.
2. If you still want the MCPAASTA *rail* product, that's a separate bet: Keydris-fork = vault + per-redemption ledger, aimed at MCP tools that call *paid third-party APIs*. Different customer than UIPE.
3. Fix `parse-action.ts`: it returned the "Opportunity Sparks" block, not the "Action today:" line. (separate PR)

## Open questions
- Is UIPE meant to be *sold* as MCP tools (seller) or to *consume* paid tools (buyer)? Determines meter vs vault.
- Does the MCPAASTA thesis want blockchain settlement (x402/USDC) or fiat/postpaid invoicing? x402 assumes agents hold a wallet.
