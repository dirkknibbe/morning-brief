---
date: 2026-11-27
classification: build-plan
action: Read the MCP Tasks spec and prototype one UIPE tool (multi-second UI capture) as a Task that returns a handle
source_brief: briefs/2026-11-27.md
---

## TL;DR
UIPE already has a hand-rolled handle pattern: `watch` starts capture, `stop_watch` returns the summary (`packages/core/src/mcp/server.ts:374-466`). Don't replace that. Add one new tool, `watch_for({ durationMs })`, registered as a Task. The server ends the capture on its own timer, so the agent doesn't have to guess when to stop. The catch is that Tasks now come in **two wire versions**. UIPE's installed SDK (1.27.1) only speaks the older 2025-11-25 experimental one. Spend 15 minutes confirming which version Claude Code actually negotiates before you write the handler, or the 1-2 hours could go to a shape no client calls.

## Key findings
- Tasks have moved out of core MCP into an extension, `io.modelcontextprotocol/tasks` (SEP-2663). The stable schema is `2026-07-28`. Its wire shape: `resultType: "task"`, then `tasks/get`, `tasks/update` (to answer mid-task input) and `tasks/cancel`, with capabilities announced via `server/discover`. (source: https://modelcontextprotocol.io/specification/draft/basic/utilities/tasks)
- The `@modelcontextprotocol/ext-tasks` package can *request* tasks in either version, but on the receiver side it only supports **2025-11-25** tasks. So a server written today still answers with the older shape. (source: https://raw.githubusercontent.com/modelcontextprotocol/ext-tasks/main/README.md)
- UIPE has `@modelcontextprotocol/sdk@1.27.1`, which already includes `server.experimental.tasks.registerToolTask(name, {execution:{taskSupport}}, {createTask, getTask, getTaskResult})` and an in-memory task store. Nothing new to install. (source: `packages/core/node_modules/@modelcontextprotocol/sdk/dist/esm/experimental/tasks/mcp-server.d.ts`)
- The server decides when to return a task, and status messages carry progress. A keyframe count ("12 keyframes, 3.2s / 5s") fits naturally in the status message. (source: spec page, "Task lifecycle")
- This directly answers today's ethanflow friction item ("agent claimed it waited 30 min; it waited 1"). With `watch_for`, the duration is measured by the server, not the agent. That makes a better demo than "async because async".
- One limit: `frameCapture` is a single module-level object, so only one capture can run at a time. The task must refuse to start if `watch` is already capturing.

## Existing players / prior art
- UIPE `watch`/`stop_watch` — a hand-rolled start/stop handle with no timeout or polling — `server.ts:374`
- MCP SDK `registerToolTask` + `InMemoryTaskStore` — the 2025-11-25 receiver — SDK `experimental/tasks`
- `@modelcontextprotocol/ext-tasks` — the requester side for both versions, useful for a test client — github.com/modelcontextprotocol/ext-tasks

## Concrete next steps for Dirk
1. **Probe (15 min):** register a dummy task tool with `taskSupport: 'optional'` and a 3s sleep. Call it from Claude Code with MCP debug logging on. Check whether you get a `CreateTaskResult` back or the call just blocks. That tells you which version Claude Code speaks.
2. **Refactor (20 min):** move the bodies of `watch` and `stop_watch` into `startCapture()` / `stopCapture(): Summary` helpers, so the old tools and the new task share the same code.
3. **First PR (45 min):** add `watch_for({ durationMs: z.number().min(500).max(60_000) })` via `registerToolTask`, with `taskSupport: 'optional'`. `createTask` starts the capture and sets `setTimeout(durationMs)`. When the timer fires, it stops the capture and stores the summary as the task result. Each keyframe updates the status message. Cancelling the task calls `stopCapture()`.
4. **Test:** one vitest case using the SDK's in-memory client/server pair. Call `watch_for(1000)`, poll until `completed`, and assert that the reported duration falls between 1000 and 1500 ms.
5. If step 1 shows Claude Code blocks rather than polling: still ship it. `optional` falls back to a normal blocking call, which is still better than the agent guessing the timing with `watch`/`stop_watch`.

## Open questions
- Which Tasks version does Claude Code GA negotiate: 2025-11-25 core or the 2026-07-28 extension? The docs didn't say.
- Does the SDK's v2 line (if one exists) replace `experimental.tasks` with the ext-tasks receiver? If so, plan a migration.
- Should `watch_for` return keyframe PNGs inside the result, or just handles to `get_timeline`? Inline images could blow up the context.
