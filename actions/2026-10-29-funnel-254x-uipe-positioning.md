---
date: 2026-10-29
classification: research
action: Read the Funnel "254 times" writeup end-to-end, then draft a one-paragraph UIPE positioning note framing it as "short-term memory of completed actions."
source_brief: briefs/2026-10-29.md
---

## TL;DR
Read the full Funnel writeup (armincat.com/articles/fast-models-slow-agents). The headline — GLM-5.2 ran the same successful SQL query 254 times — is real but Funnel's own conclusion is *not* "the model is dumb"; it's "agent harnesses matter as much as model intelligence." That's a gift for UIPE positioning and a trap. The gift: the loop is a perfect, concrete demo of "an agent with no short-term memory of what it already did." The trap: Funnel frames the fix as **harness hygiene** (explicit tool contracts, repeat-call detection, execution budgets) — cheap guardrails any team can bolt on, not a product. The sharp UIPE note must claim the layer *above* a dedup guard: not "block the 255th identical call" but "know the call already succeeded and what it returned, so the agent advances instead of retrying." Draft note is below — use it verbatim or tighten.

## Key findings
- The 254x (and a separate 113x) loop happened because a tool exposed only a 20-row preview and the agent kept re-running the query to "get more," never recognizing the limit. "A successful tool call is not necessarily a useful tool call." (source: https://armincat.com/articles/fast-models-slow-agents)
- Funnel's prescription is three harness fixes: explicit tool contracts, bounded behavior (detect repeated equivalent calls + execution budgets), whole-system benchmarking. None is a memory layer — they're stop-gaps. (source: same)
- GLM was 2x faster per call yet 14% slower end-to-end with 66% more tool calls; same pattern seen on Kimi K2.6 and Qwen. So the "no memory of completed actions" failure is **model-agnostic and harness-shaped** — exactly UIPE's wedge. (source: same)
- This is a company blog, not an independent benchmark; no sample size or methodology given. Don't cite the numbers as proof of anything beyond "this failure mode is real and embarrassing." (source: https://ainews.leverageai.com.au/case/ai-agent-repeated-sql-query-loop)

## Existing players / prior art
- Funnel's own answer — "detect repeated equivalent calls" — competitor at the cheap end; a hash-the-call dedup guard. UIPE must out-position it, not match it.
- Entelligence / Unblocked GLM-vs-Opus writeups — same genre (model swap exposes harness), confirms the category is forming but none sells memory-of-completed-actions as a product. (source: getunblocked.com/blog/moving-agent-loops-from-anthropic-to-glm)

## Concrete next steps for Dirk
1. Paste the draft note below into the UIPE pitch doc. It's the deliverable the action asked for.
2. Add the 254x number + the "20-row preview" detail as the opening demo slide — the most visceral version of the pitch yet.
3. Decide the wedge sentence: UIPE is *not* a repeat-call blocker (Funnel already has that). It's the recall layer — "this action succeeded, here's the result, don't redo it." Write that distinction down before anyone conflates the two.

## Draft UIPE positioning note (one paragraph)
> The Funnel incident — an agent running the same successful SQL query 254 times because a 20-row preview looked incomplete — isn't a dumb-model story; Funnel runs it on Opus too and calls it a *harness* gap. It's the sharpest real-world demo yet of what UIPE fills: **short-term memory of completed actions.** Agents today have no perception that work is already done — no "have I already done this, and what did it return?" Teams patch it with repeat-call blockers and execution budgets, but a blocker only stops the 255th identical call; it doesn't let the agent *advance*, because the agent still can't recall that the first call succeeded or what it produced. UIPE applies its thesis — memory of completed actions — to agent **state**, not just time: a lightweight recall layer every model can query before and after acting, so "already done" becomes a fact the agent reasons with instead of a loop it falls into. The 254x loop is the pain; UIPE is the memory the harness is missing.

## Open questions
- What's the actual delivery surface for UIPE-as-memory — an MCP endpoint (per the "Agent action-memory MCP" spark), a library, or a harness plugin? The note is positioning; the form factor is undecided.
- Is the differentiator defensible, or will harnesses fold "recall last result" into their built-in dedup within a release or two? Worth a hard look before building.
