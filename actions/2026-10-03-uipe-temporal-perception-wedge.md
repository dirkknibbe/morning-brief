---
date: 2026-10-03
classification: research
action: Read ctxrs/figma-server's CDP perception loop and write one paragraph on where UIPE's temporal-perception layer beats raw screenshots-over-CDP.
source_brief: briefs/2026-10-03.md
---

## TL;DR
figma-server's perception is **discrete, agent-pulled stills**: a screenshot when you ask, and a before/after pair wrapped around each write with a typed postcondition. It has no concept of *change over time* — no frame stream, no diffing, no "the UI is still settling" signal. Its one event primitive (`figma.cdp_events`) is a raw, lossy escape hatch the agent must drive itself. That absence is UIPE's wedge: a temporal-perception layer answers "what is happening / has it settled / what moved" where screenshots-over-CDP only answer "what does it look like right now." The positioning paragraph is in **Concrete next steps** — drop it straight into UIPE copy.

## Key findings
- Perception is on-demand stills, not a stream. `figma.screenshot`/`figma.export` return a bounded PNG artifact ref; `figma.inspect` returns bounded visible layer names with "no raw DOM." (source: src/tools.ts, src/core.ts)
- Writes use a fixed before→act→after→verify receipt: `beforeScreenshot`, run action, `tab.check()`, `afterScreenshot`, then `verify(expectation)`. Two frozen frames per action, never a continuous capture. (source: src/core.ts)
- Tool contracts concede perception is weak: "edits are unverified without an observed postcondition" and "input dispatch alone does not prove a saved native image edit." The agent, not the server, must decide *when* a frame is meaningful. (source: src/tools.ts toolDescriptions)
- `figma.cdp_events` is the only time-based primitive and it's raw: cursor-based buffer, caps at 512 events / 1 MiB, **silently drops** on overflow (`this.dropped++`), and "commands must enable their protocol domains." No interpretation, no frame semantics. (source: src/cdp.ts, src/tools.ts)
- No `Page.startScreencast`, no frame-diffing, no settle/animation/loading detection anywhere in the CDP layer. `figma.wait_for` is a bounded typed predicate (poll-until-true), which is a substitute for not watching. (source: src/cdp.ts, src/tools.ts)

## Existing players / prior art
- ctxrs/figma-server — drives Figma-as-web-app over CDP; stills + before/after receipts; raw CDP/JS escape hatches — https://github.com/ctxrs/figma-server
- Playwright/CDP `Page.captureScreenshot` + `Page.startScreencast` — the raw layer everyone (incl. figma-server) sits on; screencast exists but figma-server doesn't use it.
- Browser-use / vision-agent loops — same still-per-step model; same blind spot UIPE targets.

## Concrete next steps for Dirk
1. **Ship this paragraph as positioning copy:** "Screenshots-over-CDP tell an agent what the screen looks like the instant it asks. They can't tell it *when* to ask. figma-server proves the ceiling: it pulls a still on demand and freezes a before/after pair around each edit, then asks the model to confirm the change by eye — because, in its own words, 'input dispatch alone does not prove a saved edit.' Its only time-aware primitive is a raw CDP event buffer that silently drops events on overflow. UIPE's temporal-perception layer closes exactly that gap: it watches the UI as a time-series, detects when it has settled versus still animating/loading, and surfaces *what changed and when* — so an agent perceives the consequence of its action instead of guessing the right moment to screenshot."
2. Pull one concrete demo contrast: an async Figma save or toast that a single after-screenshot misses but a settle-detector catches.
3. Verify the claim against UIPE's actual API names before publishing (see open question).

## Open questions
- UIPE's capabilities here are inferred from the action premise + the figma-server gap; the `ui-perception-engine` MCP didn't load this session, so I couldn't confirm UIPE actually exposes settle-detection / frame-diff tools. Confirm the exact primitives before shipping copy.
- Does figma-server's `cdp_events` + a client-side diff get "close enough" that the wedge is narrower than it looks? Worth a 30-min spike.
