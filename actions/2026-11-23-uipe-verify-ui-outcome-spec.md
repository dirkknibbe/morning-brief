---
date: 2026-11-23
classification: build-plan
action: Read Pi Dash's rulebook, then write a 1-page spec for a UIPE `verify_ui_outcome` MCP tool framed as "proof the agent finished"
source_brief: briefs/2026-11-23.md
---

## TL;DR
Pi Dash and Proof Loop answer "did it finish?" the same way. The check is defined **before** the work, and something **other than the builder** runs it. A one-call `verify_ui_outcome(expect)` that the acting agent fills in after it acts is self-grading: the agent writes expectations that match what it already sees. So split the tool in two. `expect_ui_outcome` freezes the criteria and a baseline before the action. `verify_ui_outcome(id)` checks them afterwards against UIPE's scene graph. Signing stays with AgentProof (see `actions/2026-11-20`). The spec is below. Demand is thin (the Proof Loop Show HN got 2 points), so build it as a feature that makes UIPE stand out, not as a per-check product.

## Key findings
- Pi Dash rulebook (PIDASHCONV-1), read on every run: "Done means green. The *named* tests pass. No stubs, skipped tests or placeholders." Tests are named on the issue before the implement run starts. (source: https://airepublic.com/blog/pi-dash-self-evolution-experiment/)
- "The run that writes the code never reviews it." Review "assumes the code is wrong", with two passes. A separate test run merges. A coordinator that never touches code re-dispatches runs that get stuck.
- Their oracle is contract tests run against **both** backends: the old behavior is the spec. The UI equivalent is a before/after scene diff, which `compare_states` already does.
- Proof Loop: "freezes acceptance criteria before the build, separates builder and verifier roles … refuses to call work done until every AC has a fresh PASS." It is made of files plus role discipline and has no UI-state checking. (source: https://github.com/LeoStehlik/proof-loop)
- The only HN reply on Proof Loop: "unit or even int tests are more reliable signs." That is fine for backend work, but nothing in the UI checks itself. That gap is UIPE's wedge. (source: https://news.ycombinator.com/item?id=48224992)

## Spec: `expect_ui_outcome` + `verify_ui_outcome`

**When to call** (put this in the tool description, per `actions/2026-11-21`): call it *before* any action meant to change the UI, and verify *after*. Don't use it for exploration. Use `get_scene` for that.

**`expect_ui_outcome({ url?, criteria[], settle_ms?=1500, timeout_ms?=10000 })`** → `{ expectation_id, baseline_scene_hash, criteria_sha256 }`
- Snapshots the current scene as a baseline and stores the criteria. They cannot be changed afterwards.
- Criterion kinds, which map onto the existing scene graph:
  - `visible {role, name|text}`
  - `absent {role, name|text}`
  - `text_present {text, within?}`
  - `url_matches {pattern}`
  - `changed {region|selector}`: must differ from the baseline (uses `compare_states`)
  - `unchanged {region|selector}`: guards against side effects

**`verify_ui_outcome({ expectation_id })`** → `{ verdict: PASS|FAIL|UNSETTLED, criteria: [{kind, result, evidence:{node_id, bbox, text}}], after_scene_hash, screenshot_sha256, url, ts }`
- Waits for the page to settle (no DOM or layout churn for `settle_ms`) and returns `UNSETTLED` if that doesn't happen by `timeout_ms`. This timing check is what a plain Playwright snapshot gets wrong.
- Returns PASS only if every criterion passes. It never returns a partial PASS.
- Also returns a plain-text block with `{url, ts, criteria_sha256, after_scene_hash, screenshot_sha256}` so that AgentProof's hook signs it. UIPE does no signing itself.

**Out of scope:** signing, hosted verification, billing, and auto-generating criteria from a task description (that would bring self-grading back).

**Honest limit:** if the same agent calls both tools, `criteria_sha256` only proves the criteria were set *before* the action, not that they were the right criteria. A real separation of roles needs a second agent or a human to write the expectation. Document that; don't oversell it.

## Existing players / prior art
- Pi Dash: rulebook + separate review/test runs — https://airepublic.com/blog/pi-dash-self-evolution-experiment/
- Proof Loop: frozen ACs + fresh verifier, files only — https://github.com/LeoStehlik/proof-loop
- AgentProof: signs every MCP tool call — https://agentproofchain.com/claude/
- SoduWork: "verifiable delivery" marketing (today's brief)

## Concrete next steps for Dirk
1. Copy the spec section into `~/uipe/docs/specs/verify-ui-outcome.md`, about 10 minutes.
2. First PR: only `expect_ui_outcome` plus `verify_ui_outcome` with the `visible`, `absent` and `url_matches` criteria, built on top of `compare_states` and the scene graph, with one unit test per kind. About half a day.
3. Add `changed`/`unchanged` and settle detection in a second PR.
4. Write a demo: an agent claims "added to cart", and verify returns FAIL with evidence. This is HN material because it shows the tool *catching* a false "done".

## Open questions
- Can the scene graph's node identity survive a re-render well enough for `unchanged` to work without false FAILs?
- Should expectations persist across MCP sessions, so a separate verifier agent can call `verify` later?
- Is an 18th tool worth the overlap cost, or should this be a mode of `compare_states`?
- The local UIPE checkout at `~/uipe` holds only docs (no `.git`), and `gh` is unauthenticated, so the source wasn't re-checked today. Tool names come from `actions/2026-11-21`.
