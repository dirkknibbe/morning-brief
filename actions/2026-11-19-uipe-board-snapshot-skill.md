---
date: 2026-11-19
classification: build-plan
action: Install vercel/board, sketch a ~20-line UIPE skill that posts one perception snapshot to a Board thread, judge whether it's a distribution hook
source_brief: briefs/2026-11-19.md
---

## TL;DR
The sketch is easy, maybe 30 minutes, but a "post a snapshot" skill is not a distribution hook. Board's own skill already tells agents to "attach proof" (`vb reply 812 "fixed, see after" --attach after.png`), so a screenshot-poster duplicates something Board ships. The part only UIPE has is `compare_states`: a structured before/after scene-graph diff. Build the spike around that: post the diff as the message text with before/after PNGs attached, as a reply in the agent's task thread. Run it against a **local board** (`npx @vercel/board serve`), not a Vercel team. Board is a public beta with 50 stars, so treat this as an experiment, not a channel bet.

## Key findings
- Board is a message log with channels, threads, labels and tasks. It runs inside Vercel's API ("nothing to deploy"). Identity comes from `vercel login` or OIDC, and it needs Node ≥22.18. (source: https://github.com/vercel/board)
- **Gotcha:** `vb` on npm is an *unrelated* package. Outside a project that has installed it, use `npx @vercel/board`. (source: README)
- The Board skill (`npx skills add vercel/board --skill board -g`) already teaches agents to "find the right channel, read before joining, reply in threads, **attach proof**, wait for an answer." Screenshots are covered. (source: README, docs/03-guides/01-coding-agents.md)
- Attachments are first-class: `--attach`, upload via signed SHA-256 URLs, 4 MB max per file on a local board. (source: SPEC.md)
- `npx @vercel/board serve` runs a SQLite board at `127.0.0.1:4100`, and `local({ memory: true })` gives a board for tests. You can prototype without a Vercel team. (source: README, SPEC.md)
- Tasks and labels (`vb tasks claim --label step=fix`) are how Board factories hand off work. A UIPE "verify-ui" step could be one label in that pipeline. (source: README)
- UIPE already exposes `get_screenshot`, `get_scene` (compact) and `compare_states`. No new perception code is needed, just glue. (source: ~/uipe/docs/mcp-tools.md)

## Existing players / prior art
- Board's own skill: generic "attach proof" screenshots. This is the baseline UIPE has to beat — https://github.com/vercel/board/tree/main/skills
- Board `templates/swarm`: many agents working one task queue, plus a live page. It's the natural place to demo a UI-verify step — https://github.com/vercel/board/tree/main/templates
- Mastra Factory: competing agent kanban with no Board integration. The "every Board-based factory" audience is mostly v0's internal factory today.

## Concrete next steps for Dirk
1. Start a local board in a scratch dir (5 min): `npx @vercel/board serve`, then `npx @vercel/board post uipe-test "hello"`. This confirms Node 22.18 and the CLI work.
2. Write a `SKILL.md` of about 20 lines, `uipe-board-verify`. After a UI change, it calls UIPE `compare_states`, writes the compact diff as the reply text, and passes `--attach before.png --attach after.png`. It replies in the existing task thread rather than starting a new one, which is the same etiquette Board's skill enforces.
3. Run it once by hand in Claude Code against a toy page change. Judge it on one question: **would a reviewer agent act on the diff text without opening the PNG?** If yes, the hook is real. If no, it's just a screenshot with extra steps.
4. If it passes, put a "UIPE + Board" recipe in the UIPE README or on the landing page before shipping a standalone skill. Only publish to `npx skills` once someone asks for it.

## Open questions
- Can a skill post through `--attach` from a sandboxed agent that has no `vercel login`? The sandboxed-agents guide wasn't read.
- Does the Board inspector render markdown or code blocks in message text? This decides how readable a scene-graph diff is.
- Board's pricing after the beta, and whether non-Vercel teams can ever use the hosted board.
