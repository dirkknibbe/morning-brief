---
date: 2026-08-05
classification: research
action: Clone cMCP, read its signed tool-call receipt format, and judge whether it's the shape MCPAASTA needs for micropayment settlement.
source_brief: briefs/2026-08-05.md
---

## TL;DR
cMCP's receipt (the **GatewayClaim / TRACE v0.2 Claim**) is a real, well-built signed artifact — but it is a **policy-compliance attestation, not a payment receipt**. It records *which tools ran and what the policy decided*; it has **zero settlement fields** (no amount, currency, price, quantity, payer/payee, invoice id). So the brief's "exact shape MCPAASTA needs — direct steal" is wrong: you cannot lift it as a settlement receipt. What *is* worth stealing outright is the **cryptographic envelope**: canonical-JSON + detached Ed25519 signature + hash-chained audit log + privacy-preserving per-call transcript entries. Steal the envelope, design your own payment payload, and look at x402 for the money semantics.

## Key findings
- The unit of proof is a `GatewayClaim`: `{ cmcp_version, trace{...}, gateway{...}, signature }`, emitted per-session (or per-call, configurable). (schemas/trace-claim.schema.json)
- `signature` = base64url **Ed25519 over RFC 8785 canonical JSON** of the whole body minus the signature field. Clean, boring, correct — worth copying verbatim. (schema `signature` desc)
- The per-call "line item" is `trace.tool_transcript.entries[]` = `{ tool_name, data_class, decision }`. Deliberately privacy-preserving (issue #126): **no raw params, no response bodies — and no cost/amount either.** (schema `entries`)
- Tamper-evidence = a hash-chained audit log: `gateway.audit_chain { root, tip, length }`, and `tool_transcript.hash` binds to the chain tip. Verifiable without replaying entries. This is the reusable settlement-integrity primitive. (README "How it works")
- Identity binding: `trace.subject` is a SPIFFE URI; `trace.cnf.jwk` is an Ed25519 confirmation key bound to the TEE. Verification via the `cmcp_verify` lib needs no trust in the operator. (README "TRACE Claims")
- Grep of the full schema for `amount|price|cost|payment|settle|payer|currency|quantity`: **zero hits.** This is the load-bearing negative result.

## Existing players / prior art
- **cMCP / TRACE** (agentrust-io) — TEE-attested MCP policy gateway; signed audit receipts — https://github.com/agentrust-io/cmcp
- **x402** — HTTP 402 "pay-per-call" protocol; the actual prior art for MCP/agent micropayment receipts (payer, asset, amount, settlement). You already have an `agent-payment-x402` skill locally — start there for the money fields.
- **TRACE spec** — normative envelope/verification protocol — https://trace.agentrust-io.com

## Concrete next steps for Dirk
1. **Steal the envelope, not the receipt.** Adopt cMCP's pattern: canonical JSON (RFC 8785) + detached Ed25519 sig + hash-chained log. That's the 30-min win — the integrity model, not the fields.
2. **Design the MCPAASTA settlement payload separately.** Extend a per-call entry to `{ tool_name, unit_price, quantity, amount, currency, payer, payee, nonce, invoice_ref }`. cMCP gives you none of this.
3. **Cross-reference x402** for money semantics before inventing your own — check the local `agent-payment-x402` skill + spec, then reconcile with the cMCP envelope.
4. Skip the TEE/attestation half of cMCP for v1 — it's the heaviest, least payment-relevant part.

## Open questions
- Does MCPAASTA settlement need per-call receipts or a batched session invoice? cMCP's session-level chain suits batching; x402 is per-call.
- Is on-chain/off-chain settlement the target? That decides whether the payee field is a DID, a wallet address, or an account id — cMCP answers none of this.
