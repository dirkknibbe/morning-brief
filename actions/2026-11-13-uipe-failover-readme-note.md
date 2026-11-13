---
date: 2026-11-13
classification: build-plan
action: Add a model-failover note to the UIPE README showing how an MCP client keeps working when one provider is down
source_brief: briefs/2026-11-13.md
---

## TL;DR
Don't write the note yet. The README's "graceful degradation" claim is already false in the exact case the note would advertise. If OmniParser isn't running and Claude is down, `visual=true` throws and the whole tool call fails. Ship a small fix first (about 30–45 min with a test). Then write a note that is true: the structural tier needs no model, vision falls back to local models, and UIPE runs under any MCP client, so a Claude Code outage doesn't lock you out of it. Also fix the tier-order mismatch between the README and the code while you're in there.

## Key findings
- **Detection has no failover.** `detectElements()` tries OmniParser, then calls `claudeVision.detectElements()` with no try/catch (`packages/core/src/pipelines/visual/index.ts:77-92`). `captureGraph()` calls it with no catch either (`packages/core/src/mcp/engine.ts:122`). The result: Claude 5xx + no OmniParser = `navigate`/`get_scene` with `visual=true` fail. The structural-only result is thrown away.
- **README contradicts the code on tiers.** The README says Tier B = Ollama/Qwen3-VL and Tier C = Claude, on demand only (`README.md:37-39`). The code runs **Claude first** for Tier B and falls back to Ollama only on error (`index.ts:43-59`). So every `understand` call goes to Claude, which costs money and depends on Claude being up.
- **Understanding-tier fallback works.** Claude error → Ollama health check → Ollama analysis. The error is logged, not swallowed. This part is safe to advertise.
- **`captureGraph` runs detection twice** when `includeVisual` is a depth string: `detectElements()`, then `analyze()`, which detects again (`engine.ts:122-126`). During an outage that means two failing Claude calls. Separate efficiency issue.
- **Key name drift.** `claude-vision.ts:36` reads `CLAUDE_API_KEY`. The README documents `ANTHROPIC_API_KEY`. That still works, because the SDK falls back to it when `apiKey` is undefined, but the docs should name one variable.
- **The brief's framing is off.** The HN outage hit Claude Code subscription users, i.e. the *client* went down. UIPE is an MCP server and can't keep a dead client alive. What it *can* say: "UIPE isn't tied to one client or one model. Point Codex/OpenCode/Cursor at the same stdio server; perception keeps working on DOM + a11y + local vision."

## Existing players / prior art
- Today's brief: "Failover MCP proxy" spark (route Claude → GLM/OpenRouter on 5xx). That fails over at the client/LLM layer, which is orthogonal to UIPE.
- AgentRun (brief Hot Signal): bring-your-own-harness via ACP. Same "don't marry one client" theme UIPE can point at.
- Not fetched externally. The repo answered the question, so 0/12 fetches were used.

## Concrete next steps for Dirk
1. **Fix first (TDD):** add a failing test in `packages/core/tests/unit/pipelines/visual/pipeline.test.ts`. Mock `claudeVision.detectElements` to reject with no OmniParser, and expect `analyze()` to return `{ elements: [] }` instead of throwing. Then wrap the Claude call in `detectElements()` in try/catch, log a warning, and return `[]`.
2. **Pick the tier order on purpose.** Either make the code match the README (Ollama first, Claude as fallback or on demand), which is cheaper and local-first and fits the failover story, or update the README to match the code. Recommendation: local-first.
3. **Then write the README note (~20 min).** Add a short "Provider outages" subsection under *Graceful degradation*: a table of what still works with Claude down, Ollama down, and everything down. Include one line on running UIPE from a non-Claude MCP client (e.g. a Codex `config.toml` stanza).
4. Optional: dedupe the double detect in `captureGraph`.

## Open questions
- Does `analyze_visual`/`detect_elements` on the server (`server.ts:291,325`) have its own catch, or does the error reach the MCP client as a tool error? A tool error is acceptable there; a crashed server is not.
- Was the Claude-first Tier B ordering deliberate (quality) or drift from an older design?
