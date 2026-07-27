---
date: 2026-07-27
classification: research
action: Skim SHACKLE's SP-1.0 spec for its 9 invariants + verdict schema, then write one paragraph on whether UIPE should emit signed perception receipts (cheapest test of the "audit trail as product" angle).
source_brief: briefs/2026-07-27.md
---

## TL;DR
SHACKLE's SP-1.0 is a governance daemon that signs **every verdict it emits** (Ed25519 over the entry, SHA-256 chain-link to the previous entry, append-only) — because its trust model treats the daemon as the sole authority and the agent as untrusted. That is exactly the primitive a "signed perception receipt" would give UIPE, and the mapping is 1:1: UIPE already emits mechanical verdicts (DOM changed as claimed → PASS/FAIL), so wrapping each verdict in SHACKLE's `AuditEntry` shape is cheap and industry-legible. **Answer: yes, but narrowly** — sign *per-verdict perception receipts*, not the July-19 self-fitness badge, and only if UIPE runs where the audited agent can't touch the signing key. The paragraph below is the actual deliverable.

## The paragraph (the deliverable)
UIPE should emit signed perception receipts — but the value lives entirely in the trust boundary, not the crypto. SHACKLE signs every verdict because it draws a hard line: the daemon is trusted, the agent is untrusted, so an Ed25519 signature over each `AuditEntry` plus a SHA-256 chain-link proves *the daemon* (not a compromised agent) issued this verdict and that no verdict was dropped or reordered. UIPE is already positioned as the independent verifier that "never grades its own homework," so the same signature turns each before/after DOM verdict into non-repudiable, tamper-evident evidence a third party can check: "UIPE's key attests it observed DOM-hash `X` at time `T` and rendered FAIL under ruleset v1." That is the audit-trail-as-product angle made concrete — the artifact a customer's compliance team or a downstream agent verifies instead of trusting a vendor's self-reported "our agent passed." **But the signature is theater unless UIPE holds the key somewhere the agent can't reach** (hosted service or separate daemon = real; in-process library co-located with the agent's CI = decorative, the same weakness that made the July-19 self-fitness badge weak). So: yes — sign per-verdict receipts, gate the claim on deployment posture, and don't oversell an in-process build as sealed evidence.

## Key findings
- SHACKLE signs the **verdict**, not the server: `AuditEntry` = `{entry_id (UUIDv7), timestamp_ns, tool_params_hash, verdict, deny_reason, ..., signature (Ed25519 over fields 1–13), previous_entry_hash (SHA-256)}`, written append-only (O_APPEND, no seek). (source: github.com/Fame510/SHACKLE/blob/master/SP-1.0-SPECIFICATION.md §7.1)
- The signature only means something because of the trust model: "Daemon = fully trusted; Agent = untrusted, may be compromised/adversarial." Authenticity + non-repudiation come from the signing key being held **exclusively by the daemon**; verification key is public. (source: SP-1.0 §7.3)
- Verdict enum is tiny and mechanical — ALLOW / DENY / HITL — mirroring UIPE's boolean PASS/FAIL. Verdicts are a pure function `decide(state, call) → Verdict`; state is never mutated inside it (the same perception/evaluation seam UIPE already enforces). (source: SP-1.0 §3.2–3.4)
- The 9 invariants (P1–P9: budget monotone, once-tripped-always-tripped, fresh-state-ALLOWs, deterministic output, nonce-uniqueness…) aren't directly portable — they're policy properties, not audit properties. The portable part is §7 (Ed25519 + chain-link + append-only), which maps cleanly to SOC2 CC6.3/CC7.3. (source: SP-1.0 §3.3, §8)
- This is a *different* receipt from 2026-07-19: that one attested the UIPE server passed its own tests (self-badge, weak). A perception receipt attests each independent verdict UIPE renders about someone else's agent (strong, if key is isolated). (source: actions/2026-07-19-uipe-fitness-receipt.md)

## Existing players / prior art
- **SHACKLE / SP-1.0** — Ed25519-signed, chain-linked, append-only verdict log for agent governance; copy §7 verbatim. — github.com/Fame510/SHACKLE
- **in-toto Statement v1 + DSSE / Sigstore cosign** — the standard envelope + keyless signing; still the right wrapper (flagged 2026-07-19), so the receipt verifies without shipping a key. — github.com/in-toto/attestation

## Concrete next steps for Dirk
1. **Cheapest test first (what the action asks):** hand-craft ONE signed perception receipt for a single before/after `compare_states` verdict — DOM-snapshot SHA-256 + verdict + ruleset version, DSSE-wrapped, cosign-signed — and show it to a skeptic. If "signed by UIPE over this DOM hash" moves their trust vs. plain JSON, the audit-trail angle is real; if not, invest in verifier quality, not crypto.
2. If it lands, adopt SHACKLE's chain-link: each receipt carries `previous_receipt_hash` so a sequence of verdicts is tamper-evident (proves none were dropped) — ~1 field, big legibility win for auditors.
3. Decide deployment posture explicitly and put it in the receipt (`isolation: hosted|daemon|in-process`). Never let an in-process signature be marketed as sealed third-party evidence.

## Open questions
- Does any real UIPE buyer actually need non-repudiation, or is a plain content hash enough for their "regression gate" use? (Signing matters only when an adversarial party might forge a PASS — confirm that party exists before building key management.)
- Key custody for a hosted UIPE: per-tenant signing keys, or one UIPE key with tenant scoping in the payload? Determines whether receipts are cross-tenant comparable.
