---
date: 2026-06-08
classification: research
action: Spend 30 min in Mailgent docs and decide — plug UIPE in as x402-priced MCP tool, or compete on identity?
source_brief: briefs/2026-06-08.md
---

## TL;DR

The brief mis-framed the choice. **Mailgent is buyer-side only** (wallet + identity for agents that *pay*). Selling x402-priced tools is a separate product the same team shipped: **Loomal** (`loomal.ai`). So "plug into Mailgent" really means **wrap a UIPE MCP tool with `@loomal/sdk`'s `requirePayment` middleware**, and any Mailgent-equipped agent (plus every other x402 wallet) can pay it. Compete-on-identity is a non-starter — Mailgent ships KYC, DID, vault, TOTP, calendar, USDC wallet, audit on Day 1, all on Base (Coinbase L2). The right first move today: paywall `get_screenshot` or `detect_elements` at **$0.02–0.05/call on Loomal's Free tier**, tweet it. Sketched pricing below.

## Key findings

- **Mailgent = buyer-side identity + wallet.** Agent gets `<slug>@mailgent.dev`, USDC smart-account wallet on Base, DID, vault, calendar. Pays any x402 URL/MCP tool via `mailgent.payments.pay({ url })`. (source: https://docs.mailgent.dev)
- **Loomal = seller-side x402 acquirer.** Same team, separate product. `requirePayment({ amount: "0.05" })` middleware wraps Express/Hono/Next/FastAPI/MCP handlers; runs the 402 challenge, settles on Base, returns an Ed25519 receipt. (source: https://docs.loomal.ai)
- **Loomal pricing is a take-rate model.** Free: 50 paid calls/mo, **25% per call, no card**. Starter $9/500 credits = **10% take + $0.018/credit floor**. Growth $29/3K credits = **6% take + $0.0097/credit**. (source: https://www.loomal.ai/pricing)
- **The brief's $0.001/call is uneconomic on paid tiers.** $0.001 < Loomal's $0.018 credit cost — you'd lose money per call on Starter/Growth. Either price ≥ $0.02 on a paid pack, or stay Free-tier where any price works for signaling. (source: https://www.loomal.ai/pricing)
- **x402 is not a theory anymore.** 75M tx / $24M USDC volume in last 30 days; 94K buyers, 22K sellers. (source: https://www.x402.org)
- **UIPE's MCP surface is 12 tools.** The highest-perceived-value first endpoint to paywall is `detect_elements` (OmniParser, GPU-bound, deterministic) or `get_screenshot` (cheap, demoable). (source: /Users/dirkknibbe/uipe/docs/mcp-tools.md)

## Existing players / prior art

- **Mailgent** — agent identity + wallet, x402 payer. https://mailgent.dev
- **Loomal** — x402 paywall / seller acquirer; the real plug-in surface. https://loomal.ai
- **x402 standard** — Coinbase-led open protocol, multi-network. https://www.x402.org
- **OpenAI/Anthropic native MCP marketplaces** (looming) — long-term competition for paid tool distribution, but per-call USDC is the only path that prices today.

## Concrete next steps for Dirk

1. **Sign up for Loomal Free tier** (no card). Project = `uipe`. Grab API key.
2. **Pick one UIPE MCP tool to paywall first.** Recommendation: `detect_elements` at **$0.02/call** — real perception value, demoable, real cost (OmniParser GPU time). Avoid `get_screenshot` — too easy to commodity-replace.
3. **Wrap it.** In `ui-perception-engine/`, add `@loomal/sdk` and wrap the tool handler with `requirePayment({ amount: "0.02" })`. ~10-line PR.
4. **Tweet the receipt.** First paid call's Ed25519 receipt + tx hash on Basescan is the signal — "UIPE is now an x402-priced MCP tool. $0.02/perception. Settled in 2s on Base." Tag @MailgentHQ, @loomal_ai, @x402org.
5. **Park the identity question.** Don't build identity. If UIPE-the-product ever needs an agent identity for callbacks, use Mailgent as a dep.

## Open questions

- Does Loomal's MCP wrapper support per-tool pricing inside a single MCP server, or does it gate the whole transport? (Docs imply per-tool but the example is HTTP, not MCP — confirm before PR.)
- Is `loomal.ai` Free tier rate-limited per IP or per project? Affects demo-day load risk.
- What's Mailgent/Loomal's team — sustainable startup or weekend launch? (Both look polished but no public team page found in the 30-min scope.) Worth 10 min on LinkedIn before betting distribution on them.
