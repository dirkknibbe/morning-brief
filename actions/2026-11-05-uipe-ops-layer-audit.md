---
date: 2026-11-05
classification: research
action: Audit UIPE against wasp.sh's "one operations layer, thin adapter" rule from the MCP-vs-API-vs-CLI piece
source_brief: briefs/2026-11-05.md
---

## TL;DR
Wasp's rule: split your app into **operations** (business logic, one function per user action) and **surfaces** (thin adapters — MCP, REST, CLI, dashboard — that all call the *same* operation). UIPE already follows this in spirit: `engine.ts` (`createEngine()`) is the one ops layer, explicitly "shared by server and non-MCP callers," and `index.ts` is the public API surface. The MCP `server.ts` is the adapter. Two real dents: (1) some orchestration logic lives *inline in MCP tool handlers*, not the engine, so a non-MCP caller can't reuse it; (2) several tools delegate to `*Tool.handler` modules — a second, MCP-coupled logic home that bypasses the engine. No REST/CLI surface exists, but per Wasp that's **correct** for an agent-perception product — build REST only when code runs without an agent (i.e. MCPaaSTA hosted). Net: architecture validated, with a tightening pass worth ~an afternoon.

## Key findings
- Wasp's exact prescription: "Build a high-quality MCP server and REST API at the same time, on one layer of operations. Put your server logic in plain functions, and let each surface be a thin adapter over them." (source: https://wasp.sh/blog/2026/11/03/mcp-vs-api-vs-cli-connect-ai-agents-to-your-app)
- MCP = what agents *should* do (human-in-the-loop); API/CLI = what they *can* do. MCP gets "most of your care"; API is for code that runs on its own (nightly jobs, bulk writes). (source: same)
- UIPE's `createEngine()` already *is* the ops layer — returns `captureGraph`, `runtime.{navigate,executeAction,screenshot}`, `visual.analyze`, `frameCapture`, shared by server + non-MCP callers. (source: ui-perception-engine/packages/core/src/mcp/engine.ts:66, docs/project-structure.md:47)
- **Dent 1 — logic in the adapter:** keyframe/perceptual-hash loops live inline in `server.ts` handlers (lines ~393–430, 536–543), not in the engine. A programmatic caller via `index.ts` cannot reuse that path. (source: packages/core/src/mcp/server.ts)
- **Dent 2 — parallel logic home:** several tools call `timelineTool.handler`, `componentIndexTool.handler`, `startPerceptionTool.handler` — logic that lives in MCP-coupled tool modules, not the shared engine. (source: server.ts:489,509,572)

## Existing players / prior art
- Wasp (Linkly example) — four callers (dashboard, MCP, REST, CLI) all hit one `createLink` operation — https://wasp.sh/blog/2026/11/03/mcp-vs-api-vs-cli-connect-ai-agents-to-your-app
- UIPE's own `index.ts` barrel — already the "programmatic surface" sibling to the MCP surface — docs/project-structure.md:52

## Concrete next steps for Dirk
1. **20-min skim confirm:** read the Wasp "Operations vs Surfaces" section; the one-liner is "everything that makes your app your app lives in the operation."
2. **Push Dent 1 down:** move the keyframe-capture + perceptual-hash orchestration out of `server.ts` handlers into an engine method (e.g. `engine.captureKeyframes()`), so `index.ts` callers get it too. Smallest diff that proves the rule.
3. **Reconcile Dent 2:** decide whether `timelineTool`/`componentIndexTool`/`startPerceptionTool` logic should become engine methods or stay as tool modules — pick one home, document it in architecture.md so the next tool doesn't fork the pattern again.
4. **Don't build REST yet.** Defer it to MCPaaSTA (hosted), where code genuinely runs without an agent. Adding it now is YAGNI per your own stack rules and Wasp's "API for code that runs on its own."

## Open questions
- Does any current non-MCP caller actually exist today, or is `index.ts` aspirational? (If nobody calls the engine directly, Dent 1 is theoretical until MCPaaSTA needs it.)
- Is MCPaaSTA's hosted layer planned to re-expose the 12 tools over HTTP/REST? If so, that's the forcing function to make the engine the true single source *before* the second surface ships.
