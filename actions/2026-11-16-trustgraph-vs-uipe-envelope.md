---
date: 2026-11-16
classification: research
action: Read TrustGraph's README + examples/ and write 5 lines for UIPE docs on how UIPE's policy envelope differs (UI-state provenance vs data provenance)
source_brief: briefs/2026-11-16.md
---

## TL;DR
TrustGraph (`skishore23/trustgraph`, MIT, 0 stars, launched on HN today) is a **confidentiality** enforcer. It works out who may read an output from the reader sets of everything that output was built from, and denies any action whose audience falls outside that set. It runs at a gateway, with no model in the decision path. It says outright that **integrity labels are "future work"**, and integrity is exactly what UIPE's envelope is mainly about (page text is `untrusted-web` and must never authorize an action). So the two don't compete. TrustGraph *enforces* "who may see it". UIPE *emits* "what the page looked like, when, from where, and that it is untrusted". The 5 lines are drafted below. Paste them into UIPE's README "Security model" section. Don't take a dependency on a day-old repo.

## Key findings
- **The core rule is a reader-set intersection.** `readers(output) = people who may read every input`, and an action is allowed only if its audience ⊆ readers. The answer is allow, needs-approval or deny, and approval never widens readers. (source: https://github.com/skishore23/trustgraph)
- **Sources are declared by the operator, not observed.** "It only knows what you tell it." Tools are mapped to sources in `gateway.yaml` (`capability: source | sink | read_and_sink`, with `reads: when: {path: 'Public/**'}` argument patterns). Untyped tools fall back to an `unclassified` source with restrictive readers. (source: examples/typed-gateway/gateway.yaml, policy.yaml)
- **Integrity is explicitly out of scope.** "Integrity labels, privileged argument influence tracking, field-level dependency verification, declassification … remain future work." Session-wide taint is conservative, so one confidential read can deny an unrelated public write. (source: docs/gateway.md)
- **It uses the same placement as our draft.** Typed results carry lineage in `_meta.trustgraph`. The engine stores content digests, not payloads, and a transform receipt "is a host attestation, not a proof certificate." That validates yesterday's `_meta` choice. UIPE should use its own namespace (`_meta.uipe`) so the two can coexist. (source: docs/gateway.md)
- **It integrates with the Claude Agent SDK** through a `Guard` that uses hooks to map `mcp__server__tool` names to sources and actions. A UIPE MCP tool could be listed there as a source today, with no UIPE code changes. (source: examples/integrations/claude-agent-sdk/README.md)
- **Verification is unusually rigorous for a day-old repo:** Kani bounded proofs of the decision kernel, plus a seeded simulator that must catch 3 deliberately broken builds.

## Existing players / prior art
- TrustGraph (skishore23) — confidentiality lineage + gateway enforcement — https://github.com/skishore23/trustgraph
- Not to be confused with trustgraph-ai/trustgraph (Python knowledge-graph/RAG platform, 2024)
- SpiceDB / OpenFGA — read-side permissions. TrustGraph positions itself as the write-side complement
- CaMeL / FIDES — in-agent information-flow control, including the integrity side (see `actions/2026-11-15-uipe-transitive-policy-envelope.md`)

## Draft for UIPE docs (the deliverable)
> **How this differs from data-provenance tools like TrustGraph.** TrustGraph tracks *data* provenance. It records which declared sources an output was derived from and blocks actions whose audience isn't cleared to read all of them (a confidentiality rule enforced at a gateway). UIPE tracks *UI-state* provenance. Each snapshot records what a page showed, at which URL and frame, at what time, and under which session, with a hash so consumers can detect staleness or tampering. UIPE's main label is **integrity** (`untrusted-web`: page text may be quoted but must never authorize an action), which TrustGraph explicitly leaves as future work. UIPE emits these labels in `_meta.uipe` and enforces nothing. A runtime like TrustGraph can map a UIPE capture to a `source` (confidentiality `session:<origin>` when auth was present) and enforce the rest.

## Concrete next steps for Dirk
1. Paste the block above into the UIPE README under "Security model", right after yesterday's envelope paragraph. ~10 min.
2. Rename the planned key in yesterday's issue draft from `_meta.provenance` to `_meta.uipe.provenance` so it can't collide with `_meta.trustgraph`. ~2 min.
3. Optional, ~30 min: run `./examples/typed-gateway/run.sh` (needs Rust ≥1.90, no API keys) to see the lineage graph output format before deciding whether UIPE's envelope should mirror its `Schema@version` naming (e.g. `UiSnapshot@1`).

## Open questions
- Will TrustGraph's integrity work, once it lands, use a label vocabulary UIPE should adopt instead of inventing `untrusted-web`?
- TrustGraph's `reads: when:` patterns match on tool *arguments*. Can it classify a UIPE capture by its *result* (final URL after redirects)? If not, a redirect from a public URL to an authed page would be mislabeled.
