---
date: 2026-10-10
classification: research
action: Read the Open Components AX spec and write UIPE's positioning sentence against "Verifiable — rules agents can check their work against before shipping."
source_brief: briefs/2026-10-10.md
---

## TL;DR
Open Components' AX layer makes every component rule machine-checkable: each rule in a contract carries a `check` field naming *how* an agent verifies it before shipping. Those checks split cleanly into two camps — static (`axe`, `Unit test`) and **temporal/observational** (`Visual regression test`, `Emulation` under reduced-motion / forced-colors / contrast, `200% zoom`, loading transitions, layout stability across states). axe and unit tests structurally cannot observe behaviour over time; that gap is exactly UIPE's temporal perception. **Positioning sentence below — this is the deliverable.** UIPE isn't a competitor to the standard; it's the missing verifier for the temporal subset of its checklist.

## Positioning sentence
> Open Components makes "Verifiable" the AX bar — every rule ships with a `check` an agent must pass — but the hardest checks on that list (`Visual regression test`, `Emulation`, reduced-motion, loading, layout stability across states) are about how a component behaves *over time*, which axe and unit tests can't see. UIPE's temporal perception is the engine that runs those checks: it watches a live component across states and preference toggles and emits a pass/fail an agent can read before shipping — turning the spec's "Review" and "Emulation" rows from a human eyeball into an automated AX contract check.

## Key findings
- AX "Verifiable" is operationalised as a per-rule `check` field in each contract's YAML checklist, with stable IDs like `button/stable-size` (source: https://opencomponents.dev/raw/docs/components/button.yaml)
- Static checks dominate the easy rules: `axe color-contrast`, `axe target-size`, `axe button-name`, `Unit test` — agents already have tooling here (source: button.yaml)
- Temporal/observational rules have no cheap automated check today — they read `Visual regression test` (`button/stable-size`: "No state changes the button's size or position"), `Emulation` (`button/reduced-motion`: "Nothing turns or slides when prefers-reduced-motion"), `200% zoom`, and `button/loading` ("Loading keeps the button's size and name, blocks repeated activation") (source: button.yaml)
- Contracts are already machine-readable + schema-validated (`/raw/.../button.yaml`, JSON Schema, MCP server at mcp.opencomponents.dev) — a UIPE verifier can consume the contract and report against its rule IDs directly (source: https://opencomponents.dev/docs)
- The brief's own UIPE angle matches: "ship a UIPE adapter that emits the machine-readable component spec agents can verify against, live" (source: briefs/2026-10-10.md)

## Existing players / prior art
- Open Components (UXFront) — the AX standard + MCP server + agent plugin; defines the checklist UIPE would verify against — https://opencomponents.dev/docs
- axe-core — static a11y checks; covers the `axe ...` rows, not the temporal ones — the complement, not the competitor
- Playwright visual-regression / screenshot diffing — the generic tool the spec's `Visual regression test` row implies; UIPE's edge is perceiving *motion and state transitions over time*, not single-frame diffs

## Concrete next steps for Dirk
1. Keep the positioning sentence above as the UIPE one-liner; it's grounded in the spec's actual `check` vocabulary, not marketing.
2. Map UIPE's temporal perception capabilities 1:1 against every `check: "Visual regression test"` / `"Emulation"` / `"200% zoom"` row in button.yaml — that list *is* your MVP feature set and your demo script.
3. Prototype a read-only adapter: consume a component contract from the MCP server, run UIPE against a live render, emit pass/fail keyed by rule ID (e.g. `button/reduced-motion: pass`). No new standard needed — you slot under theirs.

## Open questions
- Does UIPE's temporal perception already detect "nothing turns or slides" (reduced-motion) and "size stable across states" robustly, or is motion-vs-static classification still fuzzy? That determines how many `check` rows you can honestly claim.
- Is UXFront interested in a verifier partner, or do they intend to ship their own `Emulation` tooling? Worth watching their roadmap before investing in an adapter.
