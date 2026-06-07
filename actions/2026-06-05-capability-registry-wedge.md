---
date: 2026-06-05
classification: research
action: Spend 30 min reading Friz-zy/ai-capability-registry end-to-end; find the gaps that are the MCPAASTA wedge.
source_brief: briefs/2026-06-05.md
---

## TL;DR
Friz-zy's registry is a clean **GitOps catalog generator** — pull skills/MCP/workflow sources, output routing indexes by task/role/keyword, three trust tiers. Solo dev, 3 stars, conservative Python. It is *not* a runtime: policy ("no npx, no privileged Docker") is documented prose the agent is asked to obey, not enforced. The real wedges are everything *around* the catalog: **signed bundles, an enforcement proxy, hosted multi-tenant, and routing telemetry**. Don't build a "better registry" — five harnesses already ship one. Build the **trust+audit sidecar** that plugs into all of them and into Friz-zy's repo as the missing runtime half.

## Key findings
- The repo is fundamentally a *generator*: YAML chunks in → routing markdown + symlink packs out. Three trust tiers (`trusted`/`reviewed`/`candidate`) are string labels in YAML, **no signatures, no hashes, no verification at load time** (source: https://raw.githubusercontent.com/Friz-zy/ai-capability-registry/main/README.md).
- Importer is conservative-by-policy: ignores `npm`/`pypi`/`node`/`python` direct runners, keeps HTTPS endpoints + OCI/Docker only, all imports default `enabled: false` until manual promotion (source: scripts/discover-mcp.py).
- Routing is *prompt-side*: agent reads `routing.md` and self-selects. No runtime gate, no telemetry on what was actually loaded, no token-cost annotation per pack — the explicit warning in the README is "this can use substantially more model context."
- Trusted-source list includes Anthropic, OpenAI, Vercel, Superpowers, Trail of Bits, Kilo — **all the wrappers the brief flagged as commoditized.** Friz-zy aggregates them; nobody verifies the aggregation.
- Brief's own "supply chain attack via .github/setup.js" signal is exactly the threat model Friz-zy's policy *describes* but does not *enforce*.
- M8ven Preflight already sells the MCP-submission compliance angle (2026-04-23). Skill-bundle signing is still unowned.
- Prior dossier (2026-05-16) landed on `lasso-security/mcp-gateway` as the natural plugin host for a provenance layer. That stack pairs cleanly with the registry: gateway enforces what the registry declares.

## Existing players / prior art
- **Friz-zy/ai-capability-registry** — GitOps catalog + routing markdown — https://github.com/Friz-zy/ai-capability-registry
- **MCPfinder** — 25k-server discovery, trust signals, AGPL — solves discovery, no enforcement, no billing (briefs/2026-04-21).
- **M8ven Preflight + Trust Index** — paid MCP compliance funnel — already commercializing the trust-attestation angle for MCP submission, not skills.
- **lasso-security/mcp-gateway** — Python plugin gateway, PyPI — the natural enforcement host you already mapped.
- **QVeris** — "one protocol, 10k capabilities" $0.002/call — validates pay-per-capability demand; closer to MCPAASTA than to a registry.
- **Anthropic Skills Marketplace / Superpowers** — distribution channel; bundle trust by default, no per-pack signing.

## Concrete next steps for Dirk
1. **Pick the wedge: enforcement, not curation.** Do *not* build a competing registry. Build the runtime half Friz-zy's repo is missing — a verifier that ingests his routing indexes and (a) hashes each linked skill at load time, (b) blocks denied MCP runners at exec time, (c) emits a per-load audit record. Pitch it as "Friz-zy's GitOps registry, now actually enforced."
2. **Open a PR on Friz-zy's repo adding a `manifest.json` per pack** with `content_hash` + optional `signature` fields, plus a `validate-trust.py` script that fails the build if a `trusted` entry has no signature. Small, scoped, immediately useful — and it puts your name on the upstream that the brief calls the canonical implementation.
3. **Ship `mcp-provenance` as a library** (per the 2026-05-16 dossier), then wire it as the lasso-gateway plugin that consumes pack manifests from step 2. Now the registry, the gateway, and the audit story are one chain — and you own the middle.
4. **Skip "hosted registry SaaS" until step 1–3 land.** Five harnesses ship routing today; a hosted catalog is a feature inside any of them. Trust attestation is horizontal and survives the harness war.
5. **Verify the contrarian case before week's end.** Spend 30 min in Friz-zy's issues + the Anthropic skills marketplace policies. If Anthropic adds signed skill bundles to the marketplace in Q3, your wedge collapses into a platform feature — pivot to per-bundle telemetry instead.

## Open questions
- Does Friz-zy want a co-maintainer or is this a personal project that will reject upstream changes? (3 stars, 0 PRs — unknown intent.)
- Are Anthropic's marketplace skills currently signed/hashed, or is `npm install`-style trust the status quo there too?
- Is there a real buyer for "enforced policy on agent capability load" outside regulated industries, or is this 2027 demand?
