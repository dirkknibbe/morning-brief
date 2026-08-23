---
date: 2026-08-23
classification: build-plan
action: Prototype a `perceive_diff` meta-tool on UIPE that returns only UI/DOM changes since the agent's last observe, dogfood against one site, and measure token savings vs a full snapshot.
source_brief: briefs/2026-08-23.md
---

## TL;DR
**`perceive_diff` already exists** — it ships today as the `compare_states` MCP tool in `packages/core/src/mcp/server.ts:421`, backed by the `diffGraphs(prev, next)` engine in `pipelines/temporal/differ.ts`. It already keeps "last observe" state (`tracker.observe(graph)`) and already returns *only* a compact diff (added/removed/modified counts + top-10 field changes), not the full graph. So the "prototype" half of the action is done. The **only un-built half is the measurement** — the exact thing the action says "is the pitch" ("measure token savings… That number is the pitch"). Every UIPE dossier since April has *claimed* token savings; none has a number. Don't rebuild the tool. Write the ~1-file dogfood harness that produces the number, and ship one small correctness fix so the diff can honestly *replace* a full snapshot.

## Key findings
- `compare_states` = perceive_diff: zero-input, re-captures internally, returns diff-only text. Semantics match the action exactly. (source: `uipe/…/mcp/server.ts:421-460`)
- State is already handled by the Playwright-backed `tracker` (per browser session), **not** MCP protocol state — so the old "UIPE is stateless/stdio" blocker (actions/2026-07-15) does **not** apply here. (source: `mcp/server.ts` handler + actions/2026-07-15-uipe-mcp-stateless-deadline.md)
- Diff engine is real and typed: `SceneGraphDiff { added, removed, modified, stable }`. (source: `pipelines/temporal/differ.ts:14`)
- **Fairness gap:** `compare_states` prints *counts* for added/removed nodes but only field-level text for `modified`. An agent that needs the text of a new error banner would still call a full snapshot → the measured "savings" would be unfair unless added/removed carry their node text too.
- This was pre-spec'd as `uipe.await_settled` on 2026-08-10 (perception delta after an action). Same primitive, different trigger (post-action-settle vs since-last-observe). Reuse, don't re-spec. (source: actions/2026-08-10-uipe-mcp-ui-change-tool-spec.md)

## Existing players / prior art
- **UIPE `compare_states`** — the tool itself, already merged — `uipe/…/mcp/server.ts:421`
- **browser-use** — act → re-screenshot → LLM re-reads full DOM every step; the token cost `perceive_diff` undercuts — https://github.com/browser-use/browser-use
- **Playwright ARIA snapshots** — full-tree capture, no intra-session delta primitive — https://playwright.dev

## Concrete next steps for Dirk
1. **First PR = a measurement harness, not a tool.** `scripts/dogfood-diff.ts`: drive one real site (a form or dashboard) through ~8 actions; at each step record `tokenize(get_scene full)` vs `tokenize(compare_states diff)`. Emit a table + total-ratio. Zero core changes. ~1 hour.
2. **Small correctness fix (same PR or before it):** include added/removed node *text* in the diff output, capped, so the diff is self-sufficient and the comparison is honest. ~15 lines in the `compare_states` handler.
3. **Publish the ratio, not another spec.** One row — "full snapshot N tokens → diff M tokens, X% saved over an 8-step session" — is the artifact 50+ dossiers have hand-waved. That table is the pitch.
4. **Alias if the name matters:** register `perceive_diff` as a title/name alias of `compare_states` if the public-facing name is load-bearing for the pitch.

## Open questions
- Which site? Pick one with real post-action churn (SPA dashboard) so the diff/full ratio is representative, not a static page where diff ≈ 0.
- Does the agent ever need the *full* snapshot mid-session anyway (first load, recovery)? If yes, the pitch is "diff for steps 2..N," and the harness should report per-step, not just the total.
