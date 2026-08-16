---
date: 2026-08-16
classification: research
action: "Agent-action receipts — signed, replayable logs of what an agent did (ProofRun-style), pitched as the evidence layer insurers will demand to underwrite."
source_brief: briefs/2026-08-16.md
---

## TL;DR
The primitive — cryptographically signed, hash-chained, replayable agent-action receipts — is **already a red ocean**, with 5+ named vendors shipping it and an **open IETF draft standard** (AAT, Aug-2026 EU AI Act deadline) actively commoditizing the format. Worse, the load-bearing premise is shaky: the AI-agent insurers that exist (AIUC, Klaimee, Mount, Testudo, HSB) mostly **do not demand signed cryptographic logs** — they underwrite off litigation datasets, red-team scans, and *observability traces* (Langfuse/OTel/ClickHouse), not Ed25519 receipts. Don't build a generic ProofRun clone. The one defensible wedge, and it fits Dirk's UIPE/MCP beat, is an **open-source, MCP-native reference implementation of the IETF AAT draft** — ride the standard rather than sell a proprietary bundle against it.

## Key findings
- The IETF draft `draft-sharif-agent-audit-trail` (2026-03-29) already specs the exact thing: JSON records, RFC 8785 canonicalization, SHA-256 hash chaining, optional ECDSA P-256 signatures, mapped to EU AI Act Art. 12 (live **2 Aug 2026**), SOC2, ISO 42001, PCI DSS. A standard = the format is becoming a commodity, not a moat. (source: https://datatracker.ietf.org/doc/draft-sharif-agent-audit-trail/)
- Signed-receipt vendors already exist and overlap heavily: **Agent Receipts** (W3C VC + Ed25519 + RFC 3161), **H33** (post-quantum 8-object bundles), **Trinitite** (deterministic bit-for-bit replay + Sigstore Rekor), **AgenticRail** (Ed25519 pre-act receipts), **DeepInspect** (insurance-vertical signed records). (sources: agentreceipts.ai, h33.ai, trinitite.ai, agenticrail.nz)
- Insurers underwrite off **traces and litigation data, not signatures**. Agendex ingests Langfuse/OTel/ClickHouse traces → risk score in 48h; Testudo prices off proprietary litigation data with *no technical audit*. The "insurers will demand signed logs" claim is largely unconfirmed. (sources: agendex.io, testudo.co)
- The real 2026 underwriting research points to **"trace-economic underwriting"** — pricing per task-trace, with gaming-resistant contracts — not cryptographic provenance. (source: arXiv 2606.16465 / 2606.16326, via zylos.ai/research)
- Where insurers *do* want evidence, it's a **"portable evidence pack"** (model cards, agent cards, commit-gate/HITL logs, lineage) for pre-bind review — broader than signed receipts. (source: regcore.ai/insights/ai-agent-insurance)

## Existing players / prior art
- **AIUC-1** — audit+cert bundled with a Lloyd's-backed policy; the audit *is* the underwriting event — https://aiuc-1.com
- **Klaimee / Mount / Testudo / HSB / Agendex** — the actual insurance/risk-scoring layer, already funded and shipping — klaimee.ai, ycombinator.com/companies/mount, testudo.co, agendex.io
- **Agent Receipts / H33 / Trinitite / AgenticRail** — the signed-receipt primitive, already built by 4+ teams
- **IETF AAT draft** — the standard that commoditizes the format

## Concrete next steps for Dirk
1. **Kill the generic-vendor framing.** "Another ProofRun" competes with 5 shipped products + a free standard. Don't.
2. **If you build anything, build the open reference impl of IETF AAT as an MCP middleware** — a drop-in proxy that emits AAT-conformant hash-chained, optionally-signed receipts for every MCP tool call. This pairs directly with your MCP-Guard / UIPE beat and rides the Aug-2026 Art. 12 deadline as distribution.
3. **Validate the insurer-demand premise before writing code:** check whether AIUC/Agendex actually accept a *signed receipt* vs. raw traces. If they only want traces, the crypto layer is dead weight — pivot to a trace-normalizer that maps arbitrary observability output to the AAT schema.

## Open questions
- Does a conformant open-source AAT implementation already exist (making even the reference-impl wedge crowded)?
- Do any real underwriters *require* signatures/non-repudiation today, or is hash-chaining + an RFC 3161 timestamp enough for pre-bind?
- Is the buyer the deployer (compliance-driven, EU AI Act) or the insurer (pricing-driven)? Different products.
