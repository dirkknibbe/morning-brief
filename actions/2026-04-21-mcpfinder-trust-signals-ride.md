---
date: 2026-04-21
classification: research
action: Read MCPfinder's llms.txt and install flow; decide whether a payment-rail PR or sibling server can ride their distribution.
source_brief: briefs/2026-04-21.md
---

## TL;DR
MCPfinder's `TrustSignals` schema is a closed interface of 7 fixed booleans with no extension point; `ConfidenceBreakdown` has 6 fixed scoring components. A PR to add a `paymentRail` signal would touch core types, SQLite schema, the scorer, and upstream sync — invasive on a 3-star, solo-maintained project still shaping v1. **The sibling-server path is strictly better: MCPfinder auto-pulls from Official Registry + Glama + Smithery on every snapshot**, so publishing a payment-rail MCP to those registries gets free discovery without a PR or coordination. Don't patch MCPfinder's schema — publish to the registries it already consumes and treat MCPfinder as a free distribution channel.

## Key findings
- Trust-signals is a flat interface, not a bag: `hasOfficialSource, isVerified, hasRepository, hasRemote, multiSource, hasRecentUpdate, requiresSecrets` — no `extensions`, no `custom`, no per-source metadata passthrough. (source: https://raw.githubusercontent.com/mcpfinder/mcpfinder/main/packages/core/src/types.ts)
- Ranking is a hard-coded weighted sum in `ConfidenceBreakdown` (base + official + verified + popularity + multiSource − penalties). Adding a new lift category is a non-trivial change, not a config tweak. (source: same types.ts)
- MCPfinder is a pure aggregator: `syncOfficialRegistry, syncGlamaRegistry, syncSmitheryRegistry` + snapshot bootstrap. Any server published to those three upstreams appears automatically — no gatekeeping at the MCPfinder layer. (source: packages/core/src/index.ts)
- The canonical agent flow is `search → get_server_details → get_install_config`; trust signals are surfaced at step 2 and drive whether the assistant recommends "strongly or cautiously." Riding this flow requires your server to *look* trustworthy by their existing criteria (official registry presence, recent updates, repo URL, low secret count). (source: https://mcpfinder.dev/llms-full.txt)
- Install flow is zero-friction: `npx -y @mcpfinder/server` or a one-liner SKILL.md curl. Low cost to validate a sibling approach end-to-end. (source: https://mcpfinder.dev/llms.txt)
- Project is tiny — 3 stars, 0 open issues, 0 external PRs, AGPL-3.0, commercial-license contact `hello@coderai.de`. A schema-extension PR lands on one maintainer. (source: https://github.com/mcpfinder/mcpfinder)

## Existing players / prior art
- Official MCP Registry (`registry.modelcontextprotocol.io`) — upstream source of truth; schema lives in `RegistryServerEntry._meta`, which MCPfinder reads. This is the real extensibility point, not MCPfinder.
- Glama + Smithery — the other two upstream registries MCPfinder aggregates. Publishing to all three maximizes `sourceCount` → boosts `confidenceScore`.
- MCPfinder itself — discovery layer, not a gatekeeper. Trust signals are derived, not authored.

## Concrete next steps for Dirk
1. **Drop the PR idea.** MCPfinder's schema is too young and too closed for a domain-specific trust field; a PR is high-effort, low-probability-of-merge, and the maintainer has no inbound-PR track record.
2. **Scope a payment-rail MCP server as a standalone artifact** — define the tool surface (e.g. `quote_rail`, `settle_payment`, `list_supported_rails`), target transport stdio, keep secret count ≤1 so `installComplexity` lands at "low".
3. **Plan the publication path: Official Registry first, then Glama + Smithery.** Multi-source presence is what lifts `confidenceScore` inside MCPfinder — that's the distribution win.
4. **Write the server's README to game their warning flags**: repository URL present, recent `updatedAt`, clear install-method, published tool manifest (so `capabilityCount > 0`).
5. **Revisit the PR question in 3-6 months** *only if* MCPfinder grows past ~100 stars and adds an `extensions`/`_meta` passthrough. Until then, the upstream registries' `_meta` field is the correct place to propose a `paymentRail` signal.

## Open questions
- Does the Official MCP Registry's `_meta` schema accept arbitrary custom fields, and does MCPfinder's `ServerDetail` currently surface them? Worth a 10-min spike on the registry's JSON schema before committing to a sibling-server direction.
- Is there already a published x402 / payment-adjacent MCP server in any of the three registries? A quick `search_mcp_servers` via MCPfinder would answer this in one call.
