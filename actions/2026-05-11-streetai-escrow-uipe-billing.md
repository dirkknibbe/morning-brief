---
date: 2026-05-11
classification: research
action: Map UIPE's per-tool-call billing onto Truuze's `complete_service(escrow_id)` precondition check
source_brief: briefs/2026-05-11.md
---

## TL;DR

Truuze's load-bearing trick is moving the *delivery predicate* out of the agent's head and into the platform: `complete_service(escrow_id)` only fires if the engine itself observed an artifact land on the transaction since the last status change. For UIPE's per-perception billing the analogue is obvious — **a billing event must require a UIPE-emitted, signed *perception receipt*, not an agent's claim that it called `perceive()`**. The bigger surprise: streetai explicitly punted *cross-agent* disputes, which is exactly the MCPAASTA case. So the Truuze lifecycle gives you a UX template but **not** a working dispute model for agent-to-agent billing.

## Key findings

- **The precondition check is platform-side, not LLM-side** — engine looks for an artifact message on the transaction since the previous state change before allowing `complete_service` to succeed. Smarter prompting did *not* fix hallucinated delivery; only the engine check did. (streetai/blog/escrow-for-ai-agents)
- **Payment confirmation is a synthetic platform message injected into the agent's session** — the agent never asks the model "did the buyer pay?" Removes social-engineering attack surface. Same shape applies to "did the perception actually fire?" (streetai)
- **Disputes use a forced binary inside 48h: `defend` *or* `agree_refund`** — no free-form "let me see what I can do." Agents take the easy refund path more often than expected. (streetai)
- **Cross-agent transactions are explicitly *out of v1* in Truuze** — "neither side has a human to escalate to." This is the exact shape of UIPE charging another agent. (streetai)
- **Owner-loop via Telegram/WhatsApp** for anything weird; routine successes never ping. Pattern to copy verbatim for MCPAASTA. (streetai)

## Existing players / prior art

- **Truuze (closed) + AaaS (open)** — agent runtime open-sourced, escrow rails closed. Tools `create_service`, `complete_service`, `respond_to_dispute` live on the open side. (streetai.org)
- **AaaS on GitHub** — referenced as the open agent framework; would be the integration target for a UIPE adapter.

## The sketch — UIPE billing mapped to `complete_service`

| Truuze concept | UIPE billing analogue |
|---|---|
| `complete_service(escrow_id)` precondition: artifact sent on transaction | `bill_perception(receipt_id)` precondition: signed perception receipt emitted by UIPE MCP since last checkpoint |
| Artifact = file/image/audio/structured data | Receipt = `{scene_graph_hash, delta_hash, ts, sig_by_UIPE}` |
| Synthetic platform "payment cleared" message | Synthetic "perception delivered" message in caller's session |
| Customer 48h approve-or-dispute window | Caller-agent 48h dispute window per receipt batch |
| Agent `defend` (show artifact) vs `agree_refund` | UIPE `defend` (replay receipt + scene-graph diff) vs `agree_refund` (auto-credit) |
| Owner-loop on Telegram | Already wired for morning-brief; reuse |

**Load-bearing implication:** the agent calling `perceive()` is not the source of truth for whether perception happened — the UIPE MCP server's signed receipt log is. This is what stops a caller hallucinating "I already perceived X, I should be charged less" and what stops UIPE billing for calls it didn't actually serve.

## Concrete next steps for Dirk

1. Spec the **perception receipt** (signed JSON: scene-graph SHA, delta SHA, render ts, server pubkey). 30 min, no code.
2. Decide whether MCPAASTA reuses Truuze's rails or owns the escrow primitive — Truuze punted cross-agent, which is your case, so **owning the primitive is the defensible move**. Spec'd already in the brief as "MCP Escrow Primitive."
3. Write the 6-state lifecycle (`pending → metered → billed → disputed → negotiating → admin_review`) for *per-call* billing, not per-service. Single PR.
4. Skip implementation until the spec is reviewed — this is a protocol design problem, not a coding problem.

## Open questions

- For per-call billing, is 48h dispute too long? Receipts are micro-transactions; a 1h window may be enough.
- Reputation systems are the cited fix for owner-collusion; what's the minimum viable reputation primitive for *agents* (not humans)? streetai has no answer.
- Auto-release window on cross-agent disputes — neither party has a human; what does timeout *to* if not admin review?
