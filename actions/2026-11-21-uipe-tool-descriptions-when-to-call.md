---
date: 2026-11-21
classification: build-plan
action: Read the Backpack post, then rewrite UIPE's MCP tool descriptions to say *when* to call (live UI state, timing, transitions), not just what they do
source_brief: briefs/2026-11-21.md
---

## TL;DR
Backpack's maintainer says the real problem is "the agent has to decide to call it, and it usually doesn't". He also says MCP is the right fit for "live data the agent can't get any other way", which is UIPE's whole pitch. Rewriting descriptions is worth the 30 minutes: 17 of UIPE's tools mostly say *what* they return, and only `navigate` says when to use it ("Always call this first"). But Backpack's biggest win was **not** a better MCP. It was version-matched guidance that sits in the agent's context before work starts (a Laravel Boost plugin). So do the rewrite, then ship a short "when to use UIPE" skill/CLAUDE.md snippet. That snippet is the bigger lever.

## Key findings
- Docs-MCP failed because calling it was optional and queries were "two words". MCP works for live state and tool use, not static docs. (source: https://backpackforlaravel.com/articles/opinions/llms-txt-and-mcp-didn-t-move-the-needle-for-us-here-s-what-did)
- Backpack's #1 intervention: guidelines plus topic-split skills already in context, so "the agent doesn't have to decide to fetch it". (same source)
- Anthropic: descriptions are "one of the most effective methods" for improving tools. Write them as if for a new hire, spelling out implicit context. "Too many tools or overlapping tools can also distract agents." (source: https://www.anthropic.com/engineering/writing-tools-for-agents)
- UIPE today has 17 tools in `packages/core/src/mcp/server.ts` plus `tools/*.ts`. Four groups overlap: `get_scene`/`compare_states`, `watch`/`stop_watch` vs `start_perception`/`stop_perception`, `get_timeline` vs `get_perception_session`, and `detect_elements`/`analyze_visual`/`get_screenshot`. An agent can't tell from the text which one to pick.
- `get_component_index`'s description is written for the maintainer ("track cost reduction"), not for the agent. Agents have no reason to call it.

## Existing players / prior art
- Laravel Boost: in-context guidelines and skills per package. https://backpackforlaravel.com
- Playwright MCP: the baseline that agents default to. UIPE descriptions should say what UIPE sees that a plain DOM snapshot can't.
- UIPE's own 2026-11-19 dossier (`actions/2026-11-19-uipe-board-snapshot-skill.md`) is the existing skill track this plugs into.

## Concrete next steps for Dirk
1. **Template (5 min).** Each description gets three parts: `Use when …` (the trigger), `Returns …` (one line), and `Prefer X instead when …` (how it differs from neighbouring tools). Keep the `<untrusted_page_content>` warning as a suffix.
2. **Rewrite the timing/transition tools first (15 min).** These are the ones Playwright can't replace. Drafts:
   - `get_timeline`: "Use when the bug depends on *order or timing*: a click that didn't register, flicker, a spinner that never resolves, a race between a network response and a DOM update. Returns one clock across clicks, mutations, network, animations and visual changes. Prefer `get_scene` for 'what's on screen now'."
   - `compare_states`: "Use right after anything that should change the UI (your own action, a timer, a websocket push) to confirm *what* changed. Cheaper than reading a full new scene."
   - `start_perception`: "Use before reproducing an intermittent or animated issue that one snapshot would miss. Supersedes `watch`; don't run both."
   - `get_component_index`: "Use on an app you've visited before to learn its component vocabulary (e.g. 'ProductCard') before writing selectors or test steps."
3. **Mark one entry point (2 min).** `navigate` already says "call first". Add to `get_scene`: "If you only need DOM text, a plain browser tool is fine. Use UIPE when layout, visibility, motion or affordance matters."
4. **Commit, then write a skill (follow-up PR).** Write a ~15-line `uipe` SKILL.md / CLAUDE.md snippet with trigger phrases ("UI looks wrong", "flaky", "animation", "after clicking nothing happens"). Ship it with the MCP so the agent doesn't have to remember to call UIPE.
5. **Measure (later).** Log which tools actually get called in a Claude Code session with UIPE installed. If `watch`, `detect_elements` or `analyze_visual` never fire, delete or merge them. That's the brief's "MCP invocation analytics" idea, pointed at UIPE itself.

## Open questions
- Do the `tests/unit/mcp/tools.test.ts` snapshots assert on description strings? If so, the rewrite will need those tests updated.
- Is `watch` still needed now that `start_perception` auto-starts it? Merging the two removes the worst overlap.
- Prefix vs suffix namespacing (`uipe_*`): Anthropic says the effect varies by model, so it needs a small eval to decide.
