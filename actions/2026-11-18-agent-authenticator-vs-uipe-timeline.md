---
date: 2026-11-18
classification: research
action: Read draft-ganesan-agent-authenticator-00 §8 (signed action records) and write five lines on whether UIPE's perception timeline can be that record
source_brief: briefs/2026-11-18.md
---

## TL;DR
No. UIPE's timeline cannot *be* the record, and the draft is built so that nothing like it could be. §8 says records are "written and signed by the AA, using keys held in the same secure hardware… The agent cannot create or modify them." UIPE runs inside the agent's trust boundary. Its timeline is an in-memory ring buffer (`capacity` 10000, `clearOnNavigate: true`) with relative timestamps and no hash chain or signature. It also records **observations**, while the draft records **actions**. The useful fit is smaller: a UIPE snapshot hash can be **evidence that a runtime-reported record points to**. That gives "what the agent saw just before it acted" a tamper-evident anchor without UIPE holding any keys. This is an individual `-00` draft, so write the paragraph and don't build anything against it.

## The five lines (deliverable, for UIPE docs)
> **UIPE and signed agent action records (draft-ganesan-agent-authenticator).** The draft's action record is written and signed only by a hardware-backed Agent Authenticator, one record per tool or API call, and hash-chained with `prev_hash`. UIPE runs inside the agent's runtime and holds no keys, so its perception timeline cannot be that record. It also records what the page *showed*, not what the agent *did*. As a local MCP server, UIPE falls under the draft's "runtime-reported" class (`source: runtime`), which the draft already marks as lower assurance. The intended integration is evidence by reference: UIPE emits a content hash of each snapshot (`_meta.uipe.provenance.hash`), and the runtime's record of the action that followed can carry that hash. An auditor can then check that the timeline the agent claims to have seen matches the one the signed record points to.

## Key findings
- **Only the AA signs records, and only actions it brokers.** One record per signed or refused tool/API call, carrying `mandate_hash`, `args_hash`, `decision`, `parent_seq` and `prev_hash`. Local tools (file edits, shell, **local MCP servers**) are "reported by the runtime… MUST carry `source: runtime`". (source: https://datatracker.ietf.org/doc/html/draft-ganesan-agent-authenticator-00 §8.1–8.2, Table 9)
- **Tamper evidence relies on things UIPE lacks.** The draft uses a hash chain, forward-secure per-epoch hardware keys, an `evidence_head` sent to every RP, and SCITT (RFC 9943) receipts. It also requires a signed heartbeat so that "a stopped AA leaves a provable gap". (same, §8.3)
- **Arguments are stored as a hash by default, and full arguments stay local.** This matches UIPE's existing plan to store digests rather than payloads in `_meta` (see `actions/2026-11-16-trustgraph-vs-uipe-envelope.md`). (same, §8.2, privacy section)
- **UIPE's timeline is ephemeral by design.** `TemporalEventStream` is a bounded buffer, cleared on navigation, with timestamps normalized to an attach-time anchor. It has no persistence, chaining or signing. (source: `~/uipe/ui-perception-engine/packages/core/src/pipelines/temporal/event-stream.ts:6-48`)
- **The draft assumes a non-compromised host.** It "does not protect against a fully compromised host". Runtime-reported records, which is where UIPE would sit, are explicitly the weaker class. (same, Security Considerations)

## Existing players / prior art
- Agent Authenticator draft (individual, -00) — https://datatracker.ietf.org/doc/html/draft-ganesan-agent-authenticator-00
- SCITT, RFC 9943 — transparency receipts the draft anchors chain heads to
- OCSF API Activity (6003) — the SIEM event shape records are emitted as
- TrustGraph `_meta.trustgraph` digests — the same "hash, not payload" pattern (11-16 dossier)

## Concrete next steps for Dirk
1. Paste the five-line block into the UIPE README "Security model" section, after the TrustGraph paragraph. ~5 min.
2. Make sure the `_meta.uipe.provenance` issue draft includes a stable **snapshot content hash** (sha256 of the canonical scene graph plus URL and timestamp). That hash is the only hook this draft needs. ~5 min.
3. Don't add hash-chaining or signing to the timeline. A chain the agent can rewrite proves nothing, and the draft puts signing in the AA on purpose.

## Open questions
- Does a future revision let the runtime attach evidence pointers (an `evidence_refs` member) to records? Today the schema has no field for it, so the hash would have to go in `args_hash` or a vendor extension.
- Will the draft get WG adoption (OAuth WG or a new agent-identity WG), or stay an individual submission?
