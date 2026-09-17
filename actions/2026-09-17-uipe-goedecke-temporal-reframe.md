---
date: 2026-09-17
classification: research
action: Stress-test UIPE's pitch against Goedecke's training-data-advantage test; reframe from "new tool for agents" to "temporal layer on the browser agents already use."
source_brief: briefs/2026-09-17.md
---

## TL;DR
Goedecke's essay is not a threat to UIPE — it's a positioning brief for it, if you drop the "new tool for agents" framing. His whole argument kills *agent-only products that agents must learn from scratch*, then explicitly blesses *marginal ergonomics on training-data-rich tools exposed via MCP/CLI/plaintext*. UIPE only fails his test if it invents a novel perception schema; it passes cleanly if it rides the browser/DOM moat and outputs plaintext diffs. The real threat isn't the essay — it's his footnote about computer-use closing the tools-for-AI vs tools-for-humans gap. UIPE's durable answer to that is the one thing a stateless screenshot pass can't give: *memory of change across sessions*. Reframe accordingly.

## Key findings
- **The training-data test, stated:** "If the benefit of the agent already knowing the human software is greater than 20% [better], they shouldn't use your new tool." (source: seangoedecke.com/dont-build-tools-for-ai-agents)
- **UIPE passes it — by inheriting, not competing.** Agents have billions of tokens on DOM/HTML/browser. A new agent-only perception format starts at zero and must beat that moat by >20% to get used. A temporal *diff* of DOM state, emitted as plaintext/Markdown, inherits the moat instead of fighting it. (source: same essay, "new programming language" argument)
- **Goedecke's own sanctioned list is UIPE's roadmap:** "expose information in plain text or Markdown, build a functional API, implement MCP servers or CLIs... improvements on the margin, not fundamental redesigns." UIPE-as-MCP-server = textbook marginal play. (source: same)
- **"Good for agents = good for humans" is a feature, not a bug.** Temporal DOM diffing is also session-replay / visual-regression / change-monitoring for humans. That dual-use is *why* it survives — it's not an agent-only bet. (source: essay, Jira/humanoid-robot argument)
- **The actual risk is the closing footnote:** "Now that GPT-6-Astra is getting really good at computer use, the gap between tools-for-AIs and tools-for-humans is closing." A model that reasons over successive screenshots erodes single-shot perception value. (source: same)

## Existing players / prior art
- **rrweb / LogRocket / FullStory** — DOM session replay for humans — the human-facing version of UIPE's capture layer; proves the tech, not the agent framing.
- **Percy / Chromatic** — visual regression diffing — "what changed" but pixel/snapshot, not agent-consumable temporal state.
- **Computer-use models (GPT-6-Astra, Claude computer-use)** — the competitive threat *and* the customer: they see a page *now* but carry no cheap cross-session memory of how it changed.

## Concrete next steps for Dirk
1. **Rewrite the one-liner.** From "UI Perception Engine — perception for agents" to: *"The temporal layer for browser agents — what changed on this page since last time, as an MCP server."* Kill "engine"/"perception" — both signal a new agent-only product.
2. **Verify the output format inherits the moat.** UIPE must emit plaintext/Markdown DOM diffs, not a bespoke schema. If it currently ships a novel format, that's the single change that decides pass/fail on Goedecke's test.
3. **Ship as MCP server + CLI first** (his explicitly-blessed surface), not a standalone app.
4. **Move the defensibility claim to cross-session memory.** Lead with "what changed since yesterday / since the agent last visited" — the durable edge a stateless computer-use pass structurally can't replicate.

## Open questions
- Does UIPE today output plaintext/Markdown diffs or a custom schema? (Decides step 2 — check the UIPE repo before rewriting the pitch.)
- Is there pull for temporal DOM diffing from real agent builders, or is this still solution-first? No demand signal in today's sources.
