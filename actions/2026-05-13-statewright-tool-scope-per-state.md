---
date: 2026-05-13
classification: build-plan
action: Install Statewright in Claude Code and study its "tool scope per state" protocol shape as a model for UIPE's DOM-perception phase gating.
source_brief: briefs/2026-05-13.md
---

## TL;DR
Statewright is a state-machine guardrail layer for coding agents — workflows are JSON, each state declares `allowed_tools`, and the MCP gateway *hard-gates* tool calls before the model sees them (not a prompt suggestion). The protocol shape UIPE wants is literally one field: `states.<phase>.allowed_tools: [...]` plus named-event transitions (`on: { READY: "next_phase" }`). Install it (30 min), run the bundled `bugfix` workflow, then mirror the schema for a UIPE workflow with phases like `scout` / `act` / `verify`, each scoped to a subset of DOM-perception tools. One caveat: Cursor enforcement is advisory-only; Claude Code is the reference target.

## Key findings
- **`allowed_tools` per state is the whole protocol.** Workflow JSON: `"states": { "planning": { "allowed_tools": ["Read","Grep","Glob"], "on": {"READY":"implementing"} }, ... }`. Rejection message is structural: "Tool 'Edit' is not available in 'planning' phase. Allowed tools: ... To advance, call statewright_transition with: READY -> implementing." (source: https://github.com/statewright/statewright)
- **Hard gate vs advisory.** Claude Code / Codex / opencode / Pi = hard (MCP protocol-layer block). Cursor = advisory (architectural limitation). Confirms UIPE's enforcement model needs to live at the MCP/tool-listing layer, not in the system prompt. (source: https://github.com/statewright/statewright)
- **Transitions are named events + optional guards.** `on: { "PASS": { "target":"completed", "guard":"tests_passed" } }`. Guards are programmatic predicates (eq, gt, exists) over context data. Same shape UIPE would use for "advance to `act` only when `scene_indexed = true`". (source: https://statewright.ai/docs)
- **Same per-state knobs UIPE will want:** `max_iterations`, `max_edit_lines`, `max_files_per_state`, `allowed_commands` (prefix-matched), `blocked_env` / `env_overrides`, `instructions` (per-phase prompt). Session isolation via `CLAUDE_SESSION_ID`. (source: https://github.com/statewright/statewright)
- **Empirical validation.** 5-task SWE-bench subset: two local models (13.8GB, 19.9GB) went 2/10 → 10/10 with statewright constraints. Frontier models: fewer tokens to completion. The mechanism — shrinking the tool surface so the model reasons instead of flailing — is exactly what UIPE's "perception tools per phase" buys. (source: https://github.com/statewright/statewright)
- **Engine is Rust, plugin layer is MCP.** Deterministic, no LLM in the loop for transition evaluation. License: Apache-2.0 / FSL-1.1-ALv2 (converts to Apache 2029). Free tier covers individual dev use; managed cloud handles run history. (source: https://github.com/statewright/statewright)

## Existing players / prior art
- **Statewright** — JSON state-machines + MCP gateway, hard tool gating per phase — https://github.com/statewright/statewright
- **Anthropic skills (`/skill`)** — phase-ish prompt scoping, but advisory only, not gated at the protocol layer — built-in to Claude Code
- **Constrained decoding / outlines-style** — adjacent idea at the token level; statewright is the tool-call analogue

## Concrete next steps for Dirk
1. **Install + run the demo** (30 min, today): `/plugin marketplace add statewright/statewright`, `/plugin install statewright`, `/reload-plugins`, then `/statewright start bugfix .` on a throwaway repo. Watch the rejection messages — that's the exact UX UIPE should mirror when a DOM-perception tool is called out of phase.
2. **Pull the JSON schema:** in the same session, ask Claude to call `statewright_search_docs("schema")` and save the result to `docs/refs/statewright-schema.json`. This is the source of truth for the protocol shape — copy field-for-field for the UIPE workflow descriptor.
3. **Draft a UIPE workflow** as `workflows/uipe-perceive-act.json` with three states: `scout` (`get_scene`, `detect_elements`, `get_screenshot`), `act` (`click`, `type`, `navigate`), `verify` (`compare_states`, `get_console_logs`, `get_network_errors`). Transitions: `INDEXED → act`, `ACTED → verify`, `PASS → completed`, `FAIL → scout`. Don't wire it up yet — just the JSON, to pressure-test whether the shape covers UIPE's needs.
4. **Decide hard vs advisory for UIPE.** Statewright proves the hard-gate model works via MCP. If UIPE will ride MCP too, follow the same playbook; otherwise document why a different enforcement layer is needed.

## Open questions
- Does Statewright's `allowed_tools` accept globs / namespaces (e.g. `mcp__uipe__*`) or only literal tool names? Quickstart shows literals; schema may allow more. Check after install.
- How does `statewright_transition` resolve when the agent is mid-tool-call? UIPE's perceive→act loop is tight; transition latency matters.
- Does run-history capture tool *attempts* (rejected) or only allowed calls? Rejected attempts are signal for tuning the phase boundaries.
