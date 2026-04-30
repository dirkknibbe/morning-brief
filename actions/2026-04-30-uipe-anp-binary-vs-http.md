---
date: 2026-04-30
classification: research
action: Read the ANP spec end-to-end and decide whether UIPE's payment surface adopts ANP-style binary negotiation or stays HTTP/JSON; this blocks the MCPAASTA design doc.
source_brief: briefs/2026-04-30.md
---

## TL;DR
ANP's binary wire is elegant but solves a problem UIPE doesn't have: **LLM-in-the-loop bilateral price negotiation**. UIPE's payment surface is unit-priced API access — agents call `analyze_visual` / `act` / `get_screenshot` and get billed per call, no haggling. Adopting ANP's wire format today is premature optimization on a 3-star, 4-commit, Python-only repo whose own roadmap admits it has no SPEC.md yet. **Stay HTTP/JSON for the wire.** But steal three of ANP's ideas at the application layer: capability tokens (HMAC/JWT with budget+scope+TTL), Ed25519 agent identity, and a hard price-ceiling oracle for any LLM-emitted spend instruction. That gets MCPAASTA the safety properties without betting on someone else's Day-4 manifesto becoming a standard.

## Key findings
- ANP itself states it sits *on top of* MCP/A2A/ACP and that "JSON-RPC handles transport, ANP handles semantics" (BID/OFFER/COUNTER/ACCEPT invariants, irrevocable accept, fixed-point cents). The binary wire is a side benefit; the thesis is the *negotiation state machine*. (source: github.com/victornominista/anp)
- The 10:1 size win and 0.3ms latency only matter if the payment exchange sits *in an LLM's hot path*. UIPE's payment exchange happens machine-to-machine at session start (token issuance) and per-call (auth header) — HTTP/JSON adds ~5ms; the LLM round-trip is ~400ms. Wrong place to optimize. (source: github.com/victornominista/anp)
- ANP's headline "0 LLM tokens / negotiation" only pays off when the LLM *is* the negotiator. UIPE's pricing is set by Dirk in advance; no agent is haggling. The savings disappear. (source: github.com/victornominista/anp)
- Repo state: 3 stars, 4 commits, MIT, Python-only reference impl, bilateral sessions only, single local-JSON price feed, rule-based strategies. The roadmap explicitly lists "SPEC.md RFC formalization" and non-Python ports as TODO. (source: github.com/victornominista/anp)
- The genuinely valuable ANP primitives are at the **application layer**, not the wire: ANP-Pass capability tokens (160 bytes, signed, `budget_usd` + `budget_per_tx` + `scope` + `expires_at` + seller whitelist) and Ed25519 agent identity (`agent_id = SHA256(pubkey)[:32]`, no central registry). Both are wire-agnostic; both fix real UIPE problems (per-agent billing, blast-radius caps). (source: github.com/victornominista/anp)
- ANP's own x402 / Lightning MPP integration confirms the layering: negotiate in ANP-wire, settle in x402. UIPE has no negotiation step, so the cleanest pattern is to skip the negotiation layer entirely and settle through x402 (or Stripe metered) directly. (source: github.com/victornominista/anp)

## Existing players / prior art
- **ANP** — binary, Python-only, 3 stars. Useful primitives, uncertain trajectory. https://github.com/victornominista/anp
- **x402** — HTTP 402–based agent micropayments rail; ANP defers to it for settlement above $1. Better fit for "pay-per-call."
- **JSON-RPC over HTTPS** — what MCP itself speaks; what UIPE's neighbors already integrate.
- **JWT / Biscuit / Macaroon** — mature capability-token formats; solve the same problem as ANP-Pass with libraries in every language UIPE will ever target.

## Concrete next steps for Dirk
1. **Write the MCPAASTA design doc with HTTP/JSON as the payment-surface baseline; do not block on this decision any longer.** Add one footnote: *"Negotiation transport is pluggable; ANP-style binary is a future option if multi-seller auctions appear."*
2. **Lift ANP's three good primitives in as application-layer requirements:** (a) capability tokens — HMAC-signed JWT with `budget_usd`, `budget_per_tx`, `scope`, `expires_at`, `allowed_callers`; (b) Ed25519 agent identity, derived `agent_id`, no central registry; (c) hard price-ceiling guard before any LLM-emitted spend is honored.
3. **Use x402 (not ANP) for settlement** above the unit-call tier. UIPE's payment shape is "Stripe metered + x402 for autonomous agents," not "negotiated trade."
4. **Park ANP as a watchlist item**, not a dependency. Re-evaluate when SPEC.md ships and a non-Python implementation lands.
5. **Mirror this note into `docs/notes/2026-04-30-anp-vs-http.md`** if Dirk wants the literal location requested by the brief; the dossier here is the canonical artifact.

## Open questions
- Does MCPAASTA actually need an "agent negotiates UIPE price" case, or is fixed-tier pricing the model? If fixed, this whole binary-vs-JSON debate is moot by construction.
- Is anyone outside `victornominista` shipping ANP-compatible wrappers, or is it currently a forum-of-one? Real adoption signal would change the calculus.
