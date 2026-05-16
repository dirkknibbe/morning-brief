---
date: 2026-05-16
classification: build-plan
action: Build a provenance-on-every-response wrapper for MCP servers and post it to r/LocalLLaMA
source_brief: briefs/2026-05-16.md
---

## TL;DR
The wrapper pattern is already shipping: `lasso-security/mcp-gateway` is a Python PyPI package that sits between LLM and MCP servers with a plugin architecture (basic guardrail, xetrack tracing) and a security scanner. A greenfield 1-day sidecar duplicates it. The defensible play is a **`provenance` plugin** for that gateway that signs each tool response — because the MCP spec explicitly says "clients MUST consider tool annotations untrusted unless they come from trusted servers," so unsigned metadata is audit theater. Also: r/LocalLLaMA is a distribution mismatch — home-lab self-hosters upvote demand, they don't buy compliance SaaS. HN Show + MCP registry + a direct PR to lasso is higher leverage.

## Key findings
- `lasso-security/mcp-gateway` already implements intercepting-MCP-proxy with plugins, on PyPI, with a "security scanner" feature — this is the architecture the brief proposed building from scratch (source: https://raw.githubusercontent.com/lasso-security/mcp-gateway/main/README.md)
- MCP spec has `_meta` extension point with `prefix/name` namespacing — natural slot for `uipe.dev/provenance: {source, retrieval_ts, accession_id, content_hash, signature}` (source: https://modelcontextprotocol.io/specification/2025-06-18/basic#meta)
- MCP spec, server/tools: "clients MUST consider tool annotations to be untrusted unless they come from trusted servers." Naive metadata = trust laundering. Real audit value needs verifiable signatures (source: https://modelcontextprotocol.io/docs/concepts/tools)
- `punkpeye/mcp-proxy` is a stdio↔HTTP/SSE transport bridge only — no policy/audit layer; not a competitor (source: https://github.com/punkpeye/mcp-proxy)
- "Equibles" and "Gibil" URLs as named in the brief don't resolve via GitHub, HN Algolia, or r/LocalLLaMA search — confirm the actual project names before sinking a day into either

## Existing players / prior art
- **lasso-security/mcp-gateway** — Python intermediary with plugin model + security scanner — https://pypi.org/project/mcp-gateway/
- **punkpeye/mcp-proxy** — stdio↔HTTP/SSE bridge, no policy — https://github.com/punkpeye/mcp-proxy
- **MCP `_meta` field** — spec-blessed namespaced extension point — https://modelcontextprotocol.io/specification/2025-06-18/basic
- **MCP `structuredContent` + output schema** — alternate slot if you control the server's schema — https://modelcontextprotocol.io/docs/concepts/tools

## Concrete next steps for Dirk
1. **30 min: verify the names.** Re-find "Equibles" and "Gibil" in the source feeds — they may be paraphrased. If "Equibles" isn't a real public repo, the brief's "buyers already there" claim collapses.
2. **Read lasso-mcp-gateway's plugin interface end-to-end.** If it accepts post-response hooks, the 1-day prototype is a `provenance` plugin: hash each tool result's content, attach `{source, retrieval_ts, content_hash, ed25519_signature}` under `_meta["uipe.dev/provenance"]`, ship as `mcp-gateway-provenance` on PyPI.
3. **Build the verifier CLI alongside.** `mcp-provenance verify <response.json> --pubkey ...` — without this, you've shipped theater. With it, you have a one-screen demo for a UIPE pitch deck: "the model's tool output is tamper-evident, here's the failed check when I mutate one byte."
4. **Distribution: skip r/LocalLLaMA.** Show HN ("MCP responses you can verify"), MCP registry submission, and a direct PR/email to lasso maintainers. The Equibles thread proves demand for provenance, not willingness to pay — those are different audiences.
5. **Fallback shape if lasso's plugin API is too rigid:** ship `mcp-provenance` as a *library* (Python + TS), not a sidecar — both lasso users and standalone MCP server authors can adopt it in three lines. Library beats sidecar for adoption when the value is per-response framing.

## Open questions
- Where do "Equibles" and "Gibil" actually live? Cannot locate either via GitHub, HN, or Reddit search.
- Does lasso-mcp-gateway's plugin API expose a post-response hook, or only request-side sanitization?
- Which signing envelope does the compliance buyer expect — raw ed25519, JWS, or Sigstore-style? Affects whether this is a weekend or a quarter.
