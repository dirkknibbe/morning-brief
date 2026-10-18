---
date: 2026-10-18
classification: research
action: Read ForgeMesh Pay-per-Crawl (x402) architecture and sketch the mirror-image UIPE "proof-of-intent" handshake that turns a blocked crawl into a paid one — decide UIPE feature vs standalone MCP.
source_brief: briefs/2026-10-18.md
---

## TL;DR
The "proof-of-intent handshake" quietly conflates two *separate* layers that are **both already solved** by standards, not products. Getting past a Cloudflare-style block is an *identity* problem → solved by **Web Bot Auth** (HTTP Message Signatures, IETF draft, live on Cloudflare's edge since July 2026). Paying a 402 is a *payment* problem → solved by **`@x402/fetch` / `@x402/axios`** (≈5 lines, Cloudflare's own agents SDK ships an x402 example). There is no standalone MCP worth building here — the novel middle is just *composition glue*. Verdict: **a thin UIPE feature, not a standalone MCP.** ~1 day to prototype, and only if UIPE agents actually hit paywalled/gated origins today.

## Key findings
- ForgeMesh is purely **server-side**: a gate (Gate.handle → 402 → verify/settle via PayAI facilitator → serve on tx hash, EIP-3009 USDC on Base). The "mirror image" client is the trivial half. (source: https://packagist.org/packages/forgemesh/pay-per-crawl-core)
- The agent-side x402 client is a **commodity**: `wrapFetchWithPayment(fetch, client)` auto-detects 402, signs, retries. Also `@x402/axios`, `@x402/hono`, and an **MCP transport** already exist. (source: https://www.npmjs.com/package/@x402/fetch)
- **Payment ≠ access.** ForgeMesh's own core README: *"A crawler blocked at the edge never reaches your server and never sees the 402."* So you must pass the bot gate *first*, then pay. The brief's "blocked crawl → paid crawl" is two layers, not one. (source: https://packagist.org/packages/forgemesh/pay-per-crawl-core)
- The real "proof-of-intent" already has a name: **Cloudflare Web Bot Auth** — agent signs requests (Ed25519, `Signature`/`Signature-Input`/`Signature-Agent` headers), hosts a JWKS directory, Cloudflare validates at the edge and marks traffic Verified. An MCP can't beat an edge-validated crypto standard. (source: https://blog.cloudflare.com/verified-bots-with-cryptography/)
- "Signed agents" (user-directed) are a Verified-bot class as of July 1 2026, with free open-source signing libs (Rust + TS `web-bot-auth`). The attestation infra is free and done. (source: https://blog.cloudflare.com/signed-agents/)

## Existing players / prior art
- **ForgeMesh Pay-per-Crawl** — the seller-side gate this mirrors — https://forgemesh.io/plugins
- **Coinbase x402** `@x402/fetch` + MCP transport — the buyer-side payment client, done — https://github.com/coinbase/x402
- **Cloudflare Web Bot Auth / signed agents** — the identity/"proof-of-intent" standard, edge-validated — https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/
- **Cloudflare agents SDK** ships an x402 example already — https://github.com/cloudflare/agents/blob/main/examples/x402

## Concrete next steps for Dirk
1. **Kill the standalone-MCP idea.** Both halves are standards; a wrapper MCP has no moat and a 1-week shelf life.
2. If (and only if) UIPE agents fetch gated/paywalled origins today, build **one UIPE outbound-fetch middleware** that composes: sign every request with `web-bot-auth` (get through the gate) **and** wrap fetch with `@x402/fetch` (auto-pay the 402). That's the whole "handshake." ~1 day.
3. Gate the build on a real need: grep UIPE for how it fetches external URLs and whether anything 402s/403s now. No hits → don't build it.

## Open questions
- Does UIPE control a persistent wallet + spend policy? Auto-paying 402s needs a budget cap / allowlist, or an agent quietly drains USDC.
- Web Bot Auth requires registering a key directory with Cloudflare (and non-abusive behavior); is UIPE's traffic shaped to qualify, or would it get the signature rejected and fall back to the normal block?
