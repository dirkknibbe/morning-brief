---
date: 2026-04-25
classification: research
action: Read browser-use's "Bitter Lesson of Agent Harnesses" and write 200 words on "UIPE as skill, not framework" to docs/.
source_brief: briefs/2026-04-25.md
---

## TL;DR
Browser-Use's post is the *strong* version of the bitter-lesson argument: not just "don't wrap the LLM," but "don't wrap its tools." Their 4-file, ~600-line harness (SKILL.md + helpers.py + daemon.py + run.py) lets the agent edit `helpers.py` mid-task — they forgot `upload_file()`, the agent wrote it. UIPE's 12-tool MCP surface is exactly the abstraction this thesis kills. **But UIPE's actual moat — fused visual + structural + temporal perception via OmniParser + DOM + change-tracking — is genuine backend compute, not something the agent can grep its way into rewriting.** The reframe isn't "delete UIPE," it's "shrink UIPE to a perception kernel + SKILL.md, drop the 12-tool API surface." Two primitives (`scene()`, `diff()`), a SKILL.md teaching the agent to act via raw CDP, helpers it can extend. Ship that or get ripped out on day one of someone else's harness.

## Key findings
- Browser-Use admits they were wrong about "agents shouldn't have to know CDP nuances" — turns out LLMs already know CDP from training data, and the watchdog services they built to hide it were the bug, not the fix. (source: https://browser-use.com/posts/bitter-lesson-agent-harnesses)
- The "magical moment" is the proof: agent hit a missing `upload_file()`, grepped `helpers.py`, wrote it from raw `DOM.setFileInputFiles`, hit a 10MB CDP websocket cap, switched to chunked upload — all without prompting. (source: https://browser-use.com/posts/bitter-lesson-agent-harnesses)
- Their public framing is "Don't wrap the LLM. Don't wrap its tools either." 6.5k stars, 580 forks on the repo as of today — this is moving fast. (source: https://github.com/browser-use/browser-harness)
- The repo's structure is the template: `SKILL.md`, `helpers.py` (~195 lines), `daemon.py` + `admin.py` (~361 lines, the CDP bridge — *not* meant to be agent-edited), `domain-skills/` and `interaction-skills/` directories for task-specific extensions. (source: https://github.com/browser-use/browser-harness)
- UIPE today: 191 tests, TypeScript, 12 MCP tools, 3-tier vision pipeline (screenshot + OmniParser + DOM/a11y + temporal change tracking). The 12-tool API is exactly the wrap that the bitter lesson claims dies. (source: ~/uipe/CLAUDE.md)

## Existing players / prior art
- **browser-harness** — the canonical SKILL+helpers harness, raw CDP, 6.5k stars — https://github.com/browser-use/browser-harness
- **playwright-mcp** (Microsoft, 30k stars) — predefined-tool model, exactly what bitter lesson predicts will lose
- **Nimbus** (from today's brief) — browser w/ Claude Code UX, another harness-style entrant
- **tui-use** — terminal analog ("BrowserUse for the terminal"), same SKILL+helpers shape

## Concrete next steps for Dirk
1. **Write the 200 words now** — frame: keep the perception kernel (OmniParser + scene-graph), drop the 12-tool API surface, ship a `SKILL.md` + `perception.py` (~2 primitives: `scene()`, `diff()`) + the existing daemon as the CDP/vision bridge. Agent does actions via raw CDP; UIPE only answers "what's there?" and "what changed?" Save to `~/uipe/docs/uipe-as-skill.md`.
2. **Audit the 12 tools.** For each, ask: "would an agent with raw CDP + `scene()` need this?" Tools that survive are perception primitives. Tools that don't (any `act`/`click`/`type` wrapper) are framework debt — mark for deletion in the next planning cycle.
3. **Don't refactor yet.** Draft the SKILL.md as a *companion file* in the existing repo first. Get an LLM to drive it end-to-end on one real task using only `scene()` + raw CDP. If that works on a single task, you have your wedge for the full reframe.

## Open questions
- Does the OmniParser pipeline have a clean enough API to be a single `scene()` call, or does the current 3-tier fusion leak through?
- Is "UIPE as a skill *that ships inside browser-harness*" a stronger play than competing with browser-harness? (i.e. PR a `uipe-perception/` skill into their `interaction-skills/` directory)
- Does the temporal-perception piece (frame-over-frame diffing) survive the bitter lesson, or does the agent just want raw screenshots and reason about diffs itself?
