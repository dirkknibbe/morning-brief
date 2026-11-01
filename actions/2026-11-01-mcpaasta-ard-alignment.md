---
date: 2026-11-01
classification: research
action: Read the ARD spec end to end and decide in one paragraph whether MCPAASTA should align with it or stay independent.
source_brief: briefs/2026-11-01.md
---

## TL;DR
**Align — but "align vs. stay independent" is a false binary, because ARD and MCPAASTA sit on different layers and never touch.** ARD is a *pre-invocation discovery/search* protocol: a JSON-LD entry format, a `/.well-known/ard.json` publishing convention, and a federated `POST /search` API that answers "what resource is available for this task?" (§1, §5). It is explicitly **not** an execution runtime and **explicitly delegates authentication to the artifact protocol, not the discovery layer** (§3.6). MCPAASTA is that delegated auth/transport layer — the OAuth2.1/9728/8414/8707/7591 seam that fronts a stdio MCP server and makes it a callable *remote* endpoint. ARD governs how clients *find* your server; MCPAASTA governs how they *authenticate and invoke* it. So there is nothing to stay independent *from*: you align on the discovery side (emit an `application/mcp-server-card+json` ARD entry for every server the gateway fronts) and keep your auth design wholly your own, because ARD deliberately stays out of it. The upside is a free product differentiator: **the gateway already proxies the server card and owns the public domain, so auto-emitting `/.well-known/ard.json` is ~20 lines and the gateway is the natural point that satisfies ARD's publisher-authority binding (§4.5.1)** — "remote MCP in a box" becomes "discoverable, verifiable remote MCP in a box."

## Key findings
- ARD sits **entirely before invocation**; resources are invoked through their own native mechanism. It is "not MCP, A2A, Skills, or an API runtime." (source: https://agenticresourcediscovery.org)
- **Auth is delegated, not defined** — §3.6: "Agent authentication is handled by the specific artifact protocol, not the discovery layer." This is the whole answer: ARD never competes with the MCPAASTA auth seam. (source: https://agenticresourcediscovery.org/spec/)
- MCP is a **first-class recognized artifact type**: `application/mcp-server-card+json`. ARD entries point at a server card via `url`; the gateway already serves that card. (source: /spec/ §3.3, §4.4)
- Publishing is cheap and decentralized: host a manifest at `/.well-known/ard.json`, or emit `<link rel="ard">`, or an `Agentmap:` line in robots.txt. A conformant entry needs only `identifier`, `displayName`, `type`, `url|data` + 2–5 `representativeQueries`. (source: /spec/ §4.2, §5.1)
- **Publisher-authority binding (§4.5.1):** an entry claiming `urn:air:yourdomain.com:...` is rejected unless it carries an attestation from `yourdomain.com`. The gateway owns the remote endpoint's domain, so it is the correct place to publish and sign entries. `trustManifest.attestations` can also carry SOC2/SBOM/SARIF — a hook MCPAASTA could fill later. (source: /spec/ §4.5)
- **Credibility signal:** authored by R.V. Guha (creator of schema.org / RSS / RDF), Junjie Bu (Google), Shaun Smith (Hugging Face); working group includes Microsoft, Google, Hugging Face, GoDaddy. Apache-2.0. But status is **v0.91 "Proposal," dated Aug 26 2026** — media-type registrations are still pending IANA, format "may change." Low adoption risk if you treat the entry as generated output, not a hard dependency. (source: /spec/ header, §3.3 note)

## Existing players / prior art
- **ARD predecessor format** — `/.well-known/ai-catalog.json` + `rel="ai-catalog"`; superseded by `ard.json`. Don't publish on the old path. — /spec/ §5.1
- **MCP Server Card + MCP auth spec (2025-06-18)** — the artifact ARD points at, and the auth stack MCPAASTA implements. These are the two halves; ARD is the index over them. — modelcontextprotocol.io
- **`@modelcontextprotocol/sdk` `mcpAuthRouter`** — already implements 9728/8414/7591 (per yesterday's dossier); unchanged by this decision. — actions/2026-10-31-mcpaasta-rfc-gap.md

## Concrete next steps for Dirk
1. **Decide: alignment is additive, not architectural.** No change to the MCPAASTA auth design. Log the one-paragraph decision (above) and move on — this was correctly scoped as a 30-minute read.
2. **Add one gateway feature to the backlog (not now):** auto-emit `/.well-known/ard.json` for each fronted server, built from the server card the gateway already proxies. ~20 lines; defer until there's a live gateway endpoint to attach it to.
3. **Punt the trust layer.** `trustManifest`/attestations are a v2 differentiator, not MVP. Note it; don't build it.

## Open questions
- Is anyone actually running a public ARD registry that indexes `/.well-known/ard.json` today, or is v0.91 still spec-only with no crawler to be found by? (adoption, not design — determines whether step 2 has any payoff yet)
- Does the MCP community intend MCP's own registry effort to *be* an ARD registry, or a parallel index? If MCP ships its own discovery, ARD alignment may be redundant for MCP-only servers.
