---
date: 2026-10-14
classification: research
action: Pull Amex ACE Developer Toolkit docs and judge whether the Proof-of-Intent token spec is open enough to build an MCP shim.
source_brief: briefs/2026-10-14.md
---

## TL;DR
Amex's Intent Intelligence framework (Create Intent API → Intent ID + **Proof-of-Intent Token** → scoped payment credential) is **published as a readable spec**, but the token-minting APIs are **Amex-issuer/partner-gated** — there's no public sandbox or self-serve credentials, so you can't build a *working* Amex shim solo. The sharper move: build the Proof-of-Intent MCP shim against **Google's AP2**, whose "Intent Mandate" is the same concept, is genuinely open (GitHub spec + reference impl + explicit MCP/A2A extension), and which Amex itself is a launch partner of. Verdict for the 30-min question: Amex spec is open enough to *design* against, not open enough to *build* against. Pivot the build target to AP2; keep Amex as a future adapter.

## Key findings
- Amex's framework shipped 2026-10-13 as part of the ACE Developer Toolkit (launched 2026-04-14). Flow: Create Intent API captures constraints (merchant, max budget, prefs) → customer authenticates & signs → Intent ID + Proof-of-Intent Token minted → token exchanged for a single-use payment credential used at checkout instead of the card number. (source: https://techcrunch.com/2026/10/13/amex-introduces-a-framework-to-prevent-ai-agents-from-making-unauthorized-purchases/)
- Specs for Account Enablement, Intent Intelligence, and Payment Credentials are "available as of 4/14/2026" — i.e. documented, but access/credential issuance runs through partner discussions ("Amex is already in discussions with partners across the payments ecosystem"). No self-serve dev tier surfaced. (source: https://thepaypers.com/payments/news/american-express-publishes-framework-for-agentic-commerce-intent)
- Amex VP Bozian: the framework is meant to be "flexible enough to support all agentic commerce models" — strong signal it's designed to interop with AP2/ACP rather than be a closed island. (source: https://techcrunch.com/2026/10/13/amex-introduces-a-framework-to-prevent-ai-agents-from-making-unauthorized-purchases/)
- **AP2 is the open analogue**: three signed Mandates (Intent, Cart, Payment) as W3C Verifiable Credentials, payment-agnostic, explicitly usable as an MCP + A2A extension, 60+ partners *including American Express*. Open spec on GitHub. (source: https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md)
- Payment-intent-over-MCP is already shipping: Visa Intelligent Commerce ships a **Visa MCP Server**, Mastercard Agent Pay and Stripe Agent Toolkit both expose MCP. A raw Amex shim would be reinventing what the networks already give you. (source: https://paymentbrief.com/articles/ai-agents-payment-apis-mcp-stripe-toolkit/)

## Existing players / prior art
- Google AP2 — open W3C-VC mandate protocol, MCP/A2A extension, reference impl — https://github.com/google-agentic-commerce/AP2
- Visa Intelligent Commerce — live Visa MCP Server + Agent APIs — networks' own shim
- Mastercard Agent Pay / Stripe Agent Toolkit — MCP integrations already live
- Amex ACE / Intent Intelligence — proprietary, partner-gated — https://www.americanexpress.com/en-us/company/agentic-commerce/

## Concrete next steps for Dirk
1. **Don't build the Amex shim.** You can't get token-minting creds without a partner deal. Read the Amex spec only to copy its *constraint shape* (merchant/budget/prefs).
2. Clone `google-agentic-commerce/AP2`, run the reference flow, and read `docs/ap2/specification.md` for the Intent Mandate schema — that's your real token.
3. Sketch the MCP server surface on AP2: `create_intent_mandate`, `sign_mandate`, `get_cart_mandate`, `authorize_payment_mandate`. Map each Amex term (Proof-of-Intent Token ↔ Intent Mandate VC) in a 1-page crosswalk so an Amex adapter is a drop-in later.
4. Prototype against AP2's sample/stub payment rail (no real money, no partnership) to prove the shim end-to-end.

## Open questions
- Does Amex expose *any* public sandbox, or is a signed partner agreement the only path to a real Proof-of-Intent Token? (Docs imply the latter; unconfirmed.)
- Is Amex's Proof-of-Intent Token wire-compatible with AP2's Intent Mandate VC, or just conceptually parallel — i.e. how much glue does an Amex→AP2 adapter actually need?
