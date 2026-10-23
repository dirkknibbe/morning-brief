---
date: 2026-10-23
classification: research
action: Read Skillstore's MCP delivery flow and CATT's "sealed evidence" model — both are distribution/verification patterns UIPE needs, already shipped.
source_brief: briefs/2026-10-23.md
---

## TL;DR
Both are shipped reference implementations of the two halves UIPE is pitching, and they're worth copying directly. **Skillstore** is the *distribution* half: an MCP-delivered library where the agent sends only a generic task description (not the repo), guidance comes back through "file getters," and corrections become saved rules only after explicit user approval. **CATT** is the *verification* half: it runs a surrogate agent against your MCP/app/browser/API and checks what the **service actually did** against an independent record — then seals the run so it can be replayed and diffed across builds. The read-across to UIPE's temporal-perception pitch is tight: steal CATT's *seal → replay → diff* pipeline as your evidence format, and steal Skillstore's data-minimization + MCP-as-payment-surface as your distribution model. This is a good idea; the research strengthens the pitch rather than killing it.

## Key findings
- Skillstore's privacy boundary is explicit and marketed: "Connecting the library does not automatically give Skillstore your repository or full conversation" — the agent sends only a generic task description + necessary technical context (source: https://skillstore-jk.fly.dev/developers)
- Skillstore's feedback loop requires human approval before a correction becomes a reusable rule, and binds it to the *exact delivered skill* — provenance, not just a thumbs-up (source: https://skillstore-jk.fly.dev/developers)
- CATT's core move is **two-sided verification**: it checks the service's *recorded outcome* (via a private control adapter/oracle) AND the agent's answer — it never trusts the agent's self-report (source: https://github.com/Coverage-Cat/consumer-agent-testing-tool)
- "Sealed" is a precondition, not an endpoint: `replay` (deterministic playback, no model) and `diff` (compare runs across builds) **require sealed runs**. Sealing is what makes evidence verifiable and comparable (source: CATT README)
- `export` redacts a `private/` folder of host-private values — you share the export, never the raw run dir. Separation of shareable evidence from secrets (source: CATT README)
- CATT labels every surrogate-specific behavior with a "recorded basis": `documented` / `unofficial` / `assumed` / `unknown` — provenance confidence on each claim (source: CATT README)

## Existing players / prior art
- Skillstore — MCP-delivered skills library (Claude Code/Codex), public + private tiers — https://skillstore-jk.fly.dev/developers
- CATT (Coverage-Cat/consumer-agent-testing-tool) — surrogate agent testing with service-side outcome checks + sealed evidence — https://github.com/Coverage-Cat/consumer-agent-testing-tool

## Concrete next steps for Dirk
1. Adopt CATT's **seal → export → replay → diff** vocabulary as UIPE's evidence contract. The banks (brief §3) demand exactly "reconstruct what the agent saw/did at time T" — that's `replay` on a sealed temporal record. Frame UIPE's "sealed evidence" as *independent-oracle + deterministic replay*, not just a signed log.
2. Copy the **two-sided check**: UIPE must record both what the agent *perceived* and what the service/UI *actually was* at that instant, from an independent source. A perception log the agent writes about itself is the thing banks already distrust.
3. Copy Skillstore's **data-minimization boundary** as UIPE's trust pitch: publish a "what reaches UIPE" section up front. For a provenance layer this is the whole sale.
4. Borrow the **basis labels** (documented/assumed/unknown) as per-observation confidence in UIPE's perception records.

## Open questions
- How does CATT's "private control adapter/oracle" actually snapshot server state — does that generalize to a *live* UI UIPE can't instrument server-side?
- Does Skillstore charge per-fetch or per-seat? The brief calls it "MCPAASTA" but the pricing surface isn't on the developers page.
