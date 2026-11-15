---
date: 2026-11-15
classification: research
action: Read glthr's "Transitive Policies" and write one paragraph on what a UIPE response must carry to be safe to pass between agents
source_brief: briefs/2026-11-15.md
---

## TL;DR
The article's main point changes the action. Labels the model can see or rewrite give no protection. Metadata only counts if it sits in an **envelope** that a runtime outside the model maintains and enforces. UIPE can't enforce anything downstream, so its job is to *emit* a correct, tamper-evident envelope. Put it in MCP's `_meta`, not in the text payload. For UIPE the **integrity** label (this came from an untrusted web page) matters more than confidentiality. A UIPE snapshot is exactly the "untrusted content" leg of Willison's lethal trifecta. The paragraph is drafted below. Ship it as a README section, not as code.

## Key findings
- **Payload vs envelope.** The runtime keeps origin, "this is quoted content" and use restrictions as metadata "the models cannot alter". A model's summary is like *free indirect speech*: it merges voices, and the delimiters can't be put back afterwards. (source: https://glthr.com/transitive-policies-for-ai-agents)
- **Two label types do different jobs.** Confidentiality decides *who may receive* the data. Integrity decides *how untrusted input may influence actions*. Provenance alone records sources but does not grant anyone the right to receive. (same)
- **Labels only accumulate.** A summary of salaries keeps the salary label, and summarized untrusted text stays untrusted. Only an explicit, authorized exception can lift a label. (same)
- **Spec gap confirmed.** The author did a targeted search of MCP, A2A and RFC 8693 and found nothing for labeling responses or checking who receives them. RFC 8693 `act` chains treat earlier actors as "informational only". (same)
- **Prior art exists in research.** CaMeL/FIDES do in-agent information-flow control. multi-CaMeL (Oct 2026) shows CaMeL's guarantees fail between agents and fixes this with separate trusted and untrusted channels. Bedrock AgentCore temporal policies cover action history. (same)
- **"Legibility at trust boundaries".** Content that crosses a boundary must be in a form its checker can interpret. That argues for typed fields over prose, which is UIPE's natural format anyway. (same)

## Existing players / prior art
- CaMeL / multi-CaMeL — trusted control vs untrusted data channels, cross-agent version — referenced in glthr
- FIDES — information-flow labels for agent planners — referenced in glthr
- Amazon Bedrock AgentCore — temporal (action-history) policies — referenced in glthr
- Karjoth et al. 2002 "sticky policies" — the classic version of labels that travel with the data

## Draft paragraph (the deliverable)
> Every UIPE response should carry a runtime-readable envelope in MCP `_meta`, separate from the payload the model reads. It should include: **origin** (final URL after redirects, plus the frame/iframe origin for each extracted node); **observed-at** timestamp and a snapshot hash, so a downstream agent can tell a stale observation from a fresh one and detect tampering; an **integrity label** of `untrusted-web` by default, since any page text, alt text or DOM attribute is attacker-controllable and may be *quoted* but must never *authorize* an action; a **confidentiality label** derived from the session context (`public` for anonymous loads, `session:<origin>` when cookies or auth were present, because a logged-in dashboard snapshot is private data); the **requester/workflow ID** that triggered the capture, so action-history limits can count it; and a **content-type flag** separating UIPE's own measurements (diffs, coordinates, timings, trusted as observations) from text it extracted from the page (untrusted, quoted). UIPE cannot enforce these labels. A downstream runtime must refuse to drop them when an agent summarizes the snapshot. UIPE's job is to emit them so they can't be silently lost.

## Concrete next steps for Dirk
1. Paste the paragraph into UIPE's README under "Security model". ~10 min.
2. Open one UIPE issue: "emit `_meta.provenance` {origin, observedAt, snapshotSha256, integrity, confidentiality}". Leave it unbuilt for now. Implementing it is about half a day if UIPE tool responses go through a shared serializer (not checked).
3. Hold off on the brief's "Provenance labels middleware" spark. glthr's own "What Remains Hard" section says labels assigned by one runtime mean nothing to another org's runtime. A middleware product needs a runtime that honors the labels, and none exists yet.

## Open questions
- Does UIPE currently know whether a capture ran with auth cookies? If not, it can't set confidentiality honestly, so default to `session` (fail closed).
- Should `snapshotSha256` be signed (HMAC with a UIPE key) to make it tamper-*proof* rather than tamper-*evident*? That only matters if a consumer verifies it.
- Do any MCP clients today preserve `_meta` when an orchestrator re-passes tool output to another agent? Probably not, and that is the article's whole point.
