---
date: 2026-10-07
classification: research
action: Sign up for HiddenContent.ai, add its MCP connector to Claude, and trace the auth → metered-page → Stripe-topup flow end to end — clone the UX, not the product.
source_brief: briefs/2026-10-07.md
---

## TL;DR
HiddenContent.ai (by aerospark.ai) is a hidden-text detection **REST API**, not an MCP service — there is **no MCP connector to add to Claude**, so that half of the action can't be done as written. But the billing loop you wanted to study is fully documented and is exactly the MCPAASTA pattern you keep sketching: GitHub device-flow signup → 20 free pages, no card → `$HCS_KEY` bearer → `POST /v1/analyze` draws down prepaid credit at 1¢/page → a **402 problem+json** that names the exact shortfall and the buy-credit URL → `POST /v1/billing/checkout` returns a Stripe Checkout URL → optional verbatim-consent auto-refill. You can clone this UX end-to-end from the public docs alone (below) without signing up. Recommendation: lift the **402-names-the-fix + prepaid-drawdown + idempotent-on-content-hash** triad; skip the GitHub device flow unless your users are developers.

## Key findings
- **Auth = GitHub device flow, not OAuth redirect.** `POST /v1/signup/github` → `{code, pollToken}`; poll `POST /v1/signup/github/poll` (202 until authorised) → account + live key. Re-signing in recovers the same account. Email signup (`POST /v1/signup`) is the fallback. Keys shown once, stored as hashes, revocation cascades to every key a key minted. (source: https://hiddencontent.ai/docs)
- **Metered page = prepaid drawdown, no meter/invoice.** 20 free pages on GitHub signup, no card taken; then 1¢/page prepaid. `GET /v1/usage` exposes `analysisUnitsRemaining` so clients alarm *before* a 402. Analyses are idempotent on content hash (`GET /v1/documents/{sha256}`). (source: https://hiddencontent.ai/pricing)
- **The 402 is the UX centrepiece.** RFC 9457 problem doc: `type` (a real docs page), `title`, `status:402`, `detail` naming "12 of 12 used" + the exact fix URL, `requestId`. A document you can't afford is refused whole, never partially billed. This is the clonable bit. (source: https://hiddencontent.ai/docs)
- **Stripe top-up is one authenticated call.** `POST /v1/billing/checkout` → Stripe Checkout URL, $10 min / $5,000 max. `POST/GET/DELETE /v1/billing/auto-refill` = opt-in below-X-charge-Y, consent required verbatim, one call disables. (source: https://hiddencontent.ai/docs)
- **No MCP anywhere.** API root `signUp` lists only github + email; FAQ has zero MCP/Claude/connector hits. Support is support@aerospark.ai. (source: https://api.hiddencontent.ai/v1)

## Existing players / prior art
- **Stripe usage-based / credit billing** — the top-up + checkout-URL pattern HiddenContent uses verbatim — https://stripe.com/billing
- **x402** (Coinbase) — HTTP 402 as a native agent-payment protocol; the MCP-native version of this exact loop — https://github.com/coinbase/x402
- **L402** (Lightning Labs) — 402 + macaroon auth, the original "pay-per-request over HTTP 402" design — https://github.com/lightninglabs/aperture

## Concrete next steps for Dirk
1. **Clone the 402 contract first.** Implement an RFC 9457 problem+json that names the shortfall and the buy-credit URL inline — that single response is the whole UX. (~1 hr to spec against your UIPE routes.)
2. **Prepaid drawdown + `GET /usage` with `remaining`** so clients self-alarm before the 402. Idempotency keyed on request content hash.
3. **Decide the payment rail:** Stripe Checkout URL (what HiddenContent does, fastest) vs **x402** (agent-native, matches your MCPAASTA framing — likely the better clone target). Prototype one `checkout` endpoint, don't build both.
4. Skip GitHub device-flow unless your buyers are devs; email+key is one endpoint.

## Open questions
- What does the Stripe Checkout success redirect *do* (instant credit grant vs webhook delay)? Not visible without buying — test with their $10 minimum if you want the exact UX.
- Is there a sandbox/test key, or is every key live? Docs say "every key is live," implying no test mode — worth confirming before cloning that choice.
