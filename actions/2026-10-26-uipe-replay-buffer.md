---
date: 2026-10-26
classification: build-plan
action: Add a 20-line replay buffer to UIPE — persist the last N perception snapshots per session to disk, exposed as one MCP tool `uipe_replay(session, step)`.
source_brief: briefs/2026-10-26.md
---

## TL;DR
UIPE already keeps per-session perception history in memory — `TemporalTracker.getHistory()` plus the live `get_timeline` and `get_perception_session` tools (17 tools total in `server.ts`). What it does **not** have: any disk persistence, and any notion of a *session id*. So the only genuinely new capability a replay buffer adds is **durability + post-mortem addressability** — scrubbing what an agent saw in a run that already ended, after the process died. Build exactly that and nothing more, or you ship a near-duplicate of `get_timeline`. "20 lines" is optimistic (realistic first PR ≈ 80–120 lines incl. a test), but the cut is small and the demo ("scrub what the agent saw when it misclicked") is the strongest trust story UIPE has.

## Key findings
- Snapshots already exist in memory: `server.ts:84` `const tracker = new TemporalTracker()`; `tracker.observe(graph)` runs on every scene capture; `getHistory()`/`getLatest()` return them. (source: packages/core/src/mcp/server.ts)
- Two tools already expose the live timeline: `get_timeline` (Tool 13, streams events) and `get_perception_session` (Tool 17, session summary). Replay must not re-implement these. (source: server.ts, tools/get-timeline.ts)
- No disk I/O anywhere in the perception path; no `writeFile`, no persistence. Tracker/stream are process-singletons — one implicit session per server, lost on restart. (source: grep of server.ts)
- No session id is surfaced to the MCP client. `PerceptionSession` imports `randomUUID` but runs as a singleton; `uipe_replay(session, …)` needs a session key that doesn't exist yet — that's the real design gap, not the file write. (source: pipelines/perception/session.ts)
- Tools register via `server.registerTool(name, {title, description, inputSchema: z.object({...})}, handler)`. Adding one tool is a known, ~15-line pattern. (source: server.ts registration sites)

## Existing players / prior art
- Jukebox-OS — deterministic flight-recorder + time-travel runtime for multi-agent systems (Rust+Python). The maximal version of this idea; UIPE's replay is the UI-perception slice. — github (day-old, from brief)
- UIPE `get_timeline` / `get_perception_session` — the in-repo prior art you're extending, not competing with.

## Concrete next steps for Dirk
1. **Decide the session key first** (blocks everything). Mint a `sessionId` in `start_perception`/`navigate`, store it on the server instance, return it in every tool response. Without this, `uipe_replay(session, …)` has no key space.
2. **PR #1 — persist on stop.** In `stop_perception` (and `onPageClose`), write `tracker.getHistory()` + session summary to `~/.uipe/sessions/<sessionId>.json` (atomic: temp file + rename). Cap to last N (env `UIPE_REPLAY_N`, default 50). ~40 lines + one vitest asserting round-trip.
3. **PR #1 — add the read tool.** New `tools/replay.ts`: `uipe_replay({ session, step })` → read the JSON, return snapshot at `step` (or the full index when `step` omitted). Register in `server.ts`. ~30 lines.
4. Defer: live-session replay, diffing two steps, pruning/TTL, screenshot thumbnails. Not needed for the demo.

## Open questions
- Replay fidelity: is persisting the serialized scene graph per step enough for "scrub what the agent saw," or does the demo need the screenshot/frame too (bigger payload, `frame-capture` wiring)? The misclick story is more convincing *with* the image.
- Multi-session on one server: is one `TemporalTracker` singleton acceptable (persist only on stop), or does concurrent-session replay force per-session trackers — a much larger refactor than 20 lines?
