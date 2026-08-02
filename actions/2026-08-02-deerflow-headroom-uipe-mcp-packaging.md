---
date: 2026-08-02
classification: research
action: Skim deer-flow's `.agent/skills` layout and headroom's MCP interface as structural references for how a UIPE MCP should package perception + a paid toll.
source_brief: briefs/2026-08-02.md
---

## TL;DR
deer-flow and headroom answer two different questions. deer-flow shows how to **package a capability for progressive disclosure** (skill = one folder, thin `SKILL.md` + on-demand `references/scripts/templates`). headroom shows how to **expose a capability over MCP** — a minimal 3-verb tool surface (`compress` / `retrieve` / `stats`), local-first and reversible. The important surprise: headroom has **no per-call toll**. It's Apache-2.0 open-core — free local for individuals, paid only at the org layer (hosted/SSO/dashboards/support), and it explicitly markets *against* rivals who charge per hosted API call. So the "paid toll" half of the action has no direct model here; if UIPE bolts a per-call toll onto perception, it lands on the wrong side of headroom's own positioning. Copy the packaging, design the monetization separately.

## Key findings
- deer-flow skill = a directory under `.agent/skills/<name>/` containing `SKILL.md` (YAML frontmatter: `name` + a `description` that lists trigger phrases "Use when the user says…") plus optional `references/`, `scripts/`, `templates/` subfolders. Progressive disclosure: the frontmatter is always loaded, the body/refs only when triggered. (source: https://raw.githubusercontent.com/bytedance/deer-flow/main/.agent/skills/smoke-test/SKILL.md)
- deer-flow treats skills as first-class repo artifacts — there's a `skill-review-ci.yml` workflow and an orchestrator skill, i.e. skills are versioned, CI-linted, and registered via `AGENTS.md`. (source: https://api.github.com/repos/bytedance/deer-flow/git/trees/main?recursive=1)
- headroom's MCP server exposes exactly three tools: `headroom_compress`, `headroom_retrieve`, `headroom_stats`. Config is trivial: `command="headroom", args=["mcp","serve"]`. The verb split is the pattern worth stealing: **do-the-work / fetch-the-original / report-usage.** (source: https://raw.githubusercontent.com/headroomlabs-ai/headroom/main/README.md)
- headroom is reversible ("CCR" — originals cached, retrievable on demand) and local-first ("your data never leaves your machine"). That reversibility is *why* it can safely sit in the request path. (source: same README)
- Monetization is open-core, not a toll: "Headroom OSS is built for individual developers… free, local-first." Paid = "across a whole engineering org… shared always-on deployment, centralized config, dashboards, SSO, air-gapped/VPC, support — self-hosted with support, or fully managed." (source: same README)

## Existing players / prior art
- bytedance/deer-flow — long-horizon SuperAgent harness; canonical `.agent/skills` (Anthropic Agent Skills) layout — https://github.com/bytedance/deer-flow
- headroomlabs-ai/headroom — compression library + proxy + MCP; the MCP-packaging + open-core reference — https://github.com/headroomlabs-ai/headroom
- Compresr / Token Co. — the *toll* model headroom positions against (charge per hosted API call); a UIPE hosted-perception tier would resemble these, so know the objection. — https://compresr.ai

## Concrete next steps for Dirk
1. Package UIPE perception as a deer-flow-style skill folder first (`SKILL.md` with trigger phrases + `references/`), even before the MCP — it forces the "what triggers this / what's the minimal surface" thinking cheaply.
2. Model the UIPE MCP on headroom's 3-verb shape: `uipe_perceive` (do the work) / `uipe_retrieve` (fetch full artifact by id — headroom's reversibility trick) / `uipe_stats` (usage/cost meter). Resist a bigger surface.
3. Decide the toll deliberately, not by analogy. headroom gives away the in-path value because it runs locally. UIPE's defensible toll is the opposite: perception that genuinely *can't* run client-side (GPU/vision models) → a hosted-perception tier (Compresr-style), OR open-core (free local, paid org/dashboards). Pick one; don't half-toll a local capability.

## Open questions
- Does UIPE perception actually require server-side compute? If it can run locally, the honest move is headroom's open-core, and a per-call toll will read as rent-seeking.
- What's the reversible "retrieve" analog for perception — a stable artifact id (screenshot/DOM snapshot) the agent can re-pull without re-paying?
