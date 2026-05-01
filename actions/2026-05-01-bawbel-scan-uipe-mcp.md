---
date: 2026-05-01
classification: build-plan
action: pip install bawbel-scanner && bawbel scan ./ against UIPE's MCP tool descriptions before next public registry push
source_brief: briefs/2026-05-01.md
---

## TL;DR
Bawbel-scanner is real (Apache-2.0, Python 3.10+, github.com/bawbel/bawbel-scanner, created 2026-04-14, ~2 stars but actively pushed) and the 5-min scan is worth running. But a manual eyeball of UIPE's 12 tool descriptions in `ui-perception-engine/src/mcp/server.ts` shows **no smoking-gun patterns** — no "ignore previous instructions", no external fetch directives, no shell-exec hints, no PII/credential exfil language. Expected outcome: clean or one-low. The actual leverage isn't the one-shot scan — it's wiring the official Bawbel GitHub Action into UIPE's CI before the MCPAASTA registry push, so future edits (by you or by Claude) can't silently regress.

## Key findings
- **Scanner architecture is 5-stage**, only Stage 1a (15 regex rules) runs without extras; Stages 1b/1c/2/3 need YARA/Semgrep/LLM-key/Docker respectively. (source: https://github.com/bawbel/bawbel-scanner README)
- **Detection classes that map to MCP servers:** MCP tool poisoning, tool call injection, permission escalation, system prompt extraction, hidden instructions, external fetch. UIPE's descriptions are pure operational hints — none of these classes apply on inspection. (source: same README)
- **AVE standard is component-typed** — `mcp` is a first-class `component_type` distinct from `skill`/`prompt`, so the scanner knows it's looking at an MCP manifest. CVSS-AI scoring adds an "agentic scope" dimension. (source: https://github.com/bawbel/bawbel-ave SPEC.md)
- **Only file with tool descriptions in UIPE is `ui-perception-engine/src/mcp/server.ts`** (12 `server.registerTool` calls). `docs/mcp-tools.md` mirrors them in a table. No JSON manifest is published — descriptions live in TS string literals.
- **Most "directive-sounding" UIPE description** is `navigate`: *"Always call this first before using other tools."* — benign UX hint, but it's the closest thing to MCP-tool-poisoning the scanner could plausibly flag at low confidence. Worth checking the exact output.
- **UIPE is JS/TS, scanner is Python** — install via `pipx install bawbel-scanner` (don't pollute global pip) or a throwaway venv. Stage 2 LLM mode auto-uses `ANTHROPIC_API_KEY` and selects haiku-4-5; cost per scan is sub-cent.

## Existing players / prior art
- **bawbel/bawbel-scanner** — the tool itself, only candidate that scans MCP manifests with an OWASP-Agentic-AI mapping — https://github.com/bawbel/bawbel-scanner
- **bawbel/bawbel-ave** — the AVE catalog (24 records cited in README; brief says 40 — number is moving) — https://github.com/bawbel/bawbel-ave
- **GitHub Advanced Security / SARIF** — Bawbel emits SARIF, drops findings into the GitHub Security tab natively if the official action is used.

## Concrete next steps for Dirk
1. **5-min scan, throwaway env:** `pipx install bawbel-scanner && cd ~/uipe/ui-perception-engine && bawbel scan src/mcp/server.ts --format json > /tmp/bawbel-uipe.json && bawbel scan src/mcp/server.ts` (human-readable on the second pass). If clean → screenshot + post on X as proof MCPAASTA ships scanner-clean.
2. **If anything flags** (likely just `navigate`'s "Always call this first" at low confidence): either reword to *"Recommended as the first call to establish the scene graph"* (declarative, not imperative) or add to `.bawbelignore` with a one-line justification commit so the suppression is audited.
3. **Wire the GitHub Action** into `ui-perception-engine/.github/workflows/` as a `pull_request` gate with `--fail-on-severity high`. This is the actual leverage — turns the brief's "before next public registry push" into a permanent gate. ~10 min of YAML.
4. **Re-scan `docs/mcp-tools.md` and `UIPE-MANIFESTO-v3.md`** as `--component-type prompt` — manifesto-style docs are the higher-risk surface than the terse TS descriptions.
5. **Defer Stage 3 (Docker sandbox)** — overkill for a stateless tool server with no shell-exec or credential surface. Stages 0+1a+2 cover the realistic threat model for UIPE.

## Open questions
- Does Bawbel parse TS string literals out of `server.registerTool({...})` calls, or does it only scan obvious manifest formats (JSON/YAML/markdown)? If TS-blind, you'd need to either generate a JSON manifest from the registrations or scan `docs/mcp-tools.md` as the proxy. **Verify by running step 1 and checking whether all 12 tools appear in the output.**
- AVE record count discrepancy: README badge says 24, brief says 40 published. Worth a glance at `records/` in bawbel-ave to confirm what's actually live before citing externally.
- No license-pinning yet on bawbel-scanner — Apache-2.0 today, but a 2-week-old project with one maintainer. For CI use, pin to a commit SHA, not `@main`.
