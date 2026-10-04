---
date: 2026-10-04
classification: research
action: Clone rugsnare, run its release-diff against UIPE's own published tool descriptions, and decide if "tool-layer drift detection" is a native UIPE feature.
source_brief: briefs/2026-10-04.md
---

## TL;DR
The literal action can't be run: `dirkknibbe/uipe` is **private, v0.1.0, a single release** — there are no "published tool descriptions across releases" to diff, so your tool surface *cannot* have drifted yet. But there's a real, cheap win hiding inside: pin UIPE's current 12-tool MCP surface with rugsnare **now**, before v0.2 churn, so future drift gets caught from a clean baseline. On the strategic question — **no**, don't build MCP-contract drift detection as a native UIPE feature. rugsnare already owns that niche (zero-dep, 209 tests, on-chain, shipping weekly); rebuilding it is reinvention. UIPE already *has* temporal perception (`compare_states` + `temporal/`), just at the UI layer. The UIPE-native move is narrative ("agents are blind to change at every layer"), not code.

## Key findings
- rugsnare's "release-diff" (the 140-silent-changes report) was done by pinning *each published release* of a server and diffing successive versions. It needs ≥2 published versions. UIPE has one. (source: https://github.com/Paraphern/rugsnare README, repro/SILENT-CHANGES-REPORT.md)
- `rugsnare diff` compares *pinned* `{name, description, inputSchema}` hashes against a *live* server — this works on UIPE today as a **baseline pin**, not a release-diff. (source: rugsnare README, Quick start)
- UIPE is `uipe-workspace` v0.1.0, `private: true`, pnpm monorepo, not npm-published. Last push 2026-08-23. (source: https://github.com/dirkknibbe/uipe/blob/master/package.json)
- UIPE's MCP server (`@uipe/core`, `packages/core/.../mcp`) exposes **12 tools**: `navigate, get_scene, get_affordances, act, get_console_logs, get_network_errors, get_screenshot, detect_elements, analyze_visual, compare_states, watch, stop_watch`. That's exactly the surface to pin. (source: uipe README, ## MCP Tools)
- UIPE **already does temporal/drift perception** — `compare_states` ("Diff current vs previous scene graph") and a `temporal/` change-detection module. It's UI-state drift (runtime, intra-session), mechanically different from rugsnare's static tool-contract hashing (inter-release, security). (source: uipe README)

## Existing players / prior art
- **rugsnare** — hash-pin MCP tool contracts, catch drift/rug-pulls, CI gate, on-chain verify. Zero-dep. — https://github.com/Paraphern/rugsnare
- **rugsnare-pr-diff-action / canary-action** — thin wrappers; human-readable contract diff on PRs, replay calls before upgrade. — https://github.com/Paraphern/rugsnare-pr-diff-action
- MCP scanners (snyk agent-scan, ex-mcp-scan) — install-time only; rugsnare explicitly covers the *after-approval* gap they don't.

## Concrete next steps for Dirk
1. **Pin, don't diff.** In the uipe repo: `git clone https://github.com/Paraphern/rugsnare && node rugsnare/product/src/cli.js scan --config .mcp.json` pointed at your built `@uipe/core` server. Commit the pin. ~10 min. This is the baseline the brief actually wants — captured one release early.
2. **Add `rugsnare diff` to UIPE CI** so any future edit to a tool description/inputSchema fails the build. This *is* "tool-layer drift detection" for UIPE — as a dependency, not a feature.
3. **Claim the narrative, not the code.** Position UIPE as "temporal perception for agents at every layer — UI and tools." If anything ships, it's the hosted drift-feed (Opportunity Spark #1), which is distribution, not a core engine feature.
4. Skip building contract-hashing into `@uipe/core`. Different data shape, different problem, already solved.

## Open questions
- Is there appetite to surface *tool-contract* changes as just another signal inside the scene graph (one perception, two layers)? That's the only version of "native feature" that isn't reinvention — worth a brainstorm, not a build.
- Does rugsnare's `mcp` mode (read-only `drift_feed_status`) already cover the hosted-watch product you'd otherwise build?
