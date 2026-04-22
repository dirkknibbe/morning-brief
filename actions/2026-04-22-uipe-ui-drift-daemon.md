---
date: 2026-04-22
classification: build-plan
action: Clone Charlie Labs Daemons + Spectrum distribution for a UIPE "UI-drift daemon" MCP with per-run micropayment (1-day build claim)
source_brief: briefs/2026-04-22.md
---

## TL;DR
The brief conflates three different things and the "1-day build" claim does not survive contact with any of them. Charlie Labs' pricing is **tiered SaaS ($0/$50/$500/mo), not per-run micropayment** (source: charlielabs.ai/pricing). Spectrum is a **messaging-channel SDK**, not a distribution/revenue model to clone (source: photon.codes/spectrum). And wiring x402 micropayments for MCP tools is real (Coinbase Payments MCP, Seren) but adds wallet + USDC-on-Base onboarding that kills any 1-day timeline. **Recommendation: do not build a new daemon layer.** Instead, price UIPE's existing `watch` + `compare_states` tools per-call via x402 behind the "agent lied about what it did" wedge already validated in yesterday's X thread plan (`2026-04-20-uipe-lazy-claude-demo.md`). Same signal, one less moving part.

## Key findings
- Charlie Labs Daemons are **an open .md spec** (frontmatter: `name/purpose/watch/routines/deny/schedule`, body: policy/limits). Explicitly portable — "the same file works across any provider that supports the spec." Cloning the *format* is legal and intended. (source: https://charlielabs.ai)
- Charlie Labs monetization: Free / Starter $50/mo / Team $500/mo with "prepaid overage above plan limits." **No per-run pricing.** The brief's "sells the substrate" framing is correct; the "micropayment rail" framing is not. (source: https://charlielabs.ai/pricing)
- Spectrum = `npm install spectrum-ts`, open-source, free tier with unlimited iMessage messages, up to 10 users. It is a **channel layer**, not a commercial model. Dirk's morning brief appears to have mashed two unrelated Show HNs together. (source: https://photon.codes/spectrum, https://photon.codes/pricing)
- Per-call MCP micropayment is a real pattern via **x402 / HTTP 402 + USDC on Base** — Coinbase's Payments MCP and Seren's publisher marketplace both use it. But it requires wallet provisioning for every caller, which is the hard part, not the MCP wrapping. (source: https://hn.algolia.com/api/v1/search?query=x402+mcp+micropayment)
- UIPE already ships `watch`, `stop_watch`, `compare_states`, `get_scene` as MCP tools (`ui-perception-engine/README.md:13-25`). **The daemon primitives exist.** A .md wrapper adds scheduling + persistent baseline storage + notification sink — real work, not zero work.

## Existing players / prior art
- **Charlie Labs Daemons** — tiered SaaS, .md-defined background agents, GitHub/Linear/Sentry/Slack integrations. Direct precedent for the format. (https://charlielabs.ai)
- **Percy / Chromatic / Applitools** — paid visual regression SaaS. **These are the actual incumbents for "UI drift."** Any UIPE daemon story has to explain why an agent-owner would pick it over Percy, not why they'd pick it over nothing.
- **Coinbase Payments MCP + Seren** — the only working MCP-with-wallet examples. Both require the end-user to onboard USDC on Base first.

## Concrete next steps for Dirk
1. **Do not start the daemon build this week.** The brief's "1-day" estimate is off by 4-10x once scheduling, baseline storage, and x402 wallet onboarding are counted. A 6-day build for an unvalidated persona is a trap.
2. **Instead, ship UIPE's existing `compare_states` behind a paid `/verify` HTTP endpoint** with x402 metering. ~1 day of real work because UIPE is already MCP; wallet flow is the only new piece, and Coinbase's Payments MCP SDK is the shortest path. Keep the "agent lied about what it did" framing from yesterday's dossier — it's the same customer.
3. **Clone only the DAEMON.md frontmatter format as a future config surface** (`name/purpose/watch/routines/deny/schedule`). Park it in `uipe/docs/daemon-spec.md` as a design doc, not code. Ship if the `/verify` endpoint finds demand; delete if not.
4. **Measure before building again.** One week of `/verify` calls + x402 receipts tells you whether the "drift-detection per run" market exists at all.

## Open questions
- Does any actual buyer want *drift detection between agent runs*, or do they want *verification that a specific agent claim is true*? The second is UIPE's real wedge; the first is a Percy reskin.
- If x402 wallet onboarding blocks adoption, is there a non-crypto fallback (Stripe metered billing with a session key) that keeps the per-run unit economics without the Base-network friction?
