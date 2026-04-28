---
date: 2026-04-28
classification: build-plan
action: Add a token-cost dashboard mockup to UIPE landing copy to ride the 9x Copilot panic ("saves you tokens" beats "perceives UI" as a hook).
source_brief: briefs/2026-04-28.md
---

## TL;DR
**Don't pivot the hero.** Two days ago you anchored UIPE to "calm tech for machines / CDC for UI" (`2026-04-26-uipe-calm-tech-positioning.md`). Replacing it 48 hours later with "saves you tokens" trains buyers that your story is news-cycle reactive, not a thesis. Worse: a mockup dashboard with invented numbers, shipped EOD, is product theater — Helicone/Langfuse buyers will spot it instantly. Better play: add a *secondary* "Token economics" block under the existing CDC pitch, populated with **real measurements** from the lazy-claude demo run twice (DOM-poll mode vs UIPE perception). If you can't measure today, ship a 200-word HN/X post that ties the CDC frame to the 9x panic — same buying-window ride, zero credibility risk. The "saves tokens" claim *is* honest if grounded in event-driven vs polling token deltas; it is a lie if grounded in a Figma rectangle.

## Key findings
- The brief itself already names the right wedge in *Opportunity Sparks #3*: "**temporal UI perception reduces wasted agent retries... value prop in tokens saved per task, not capability.**" This is a *complement* to the calm-tech/CDC frame (don't poll, subscribe), not a replacement. Hero copy stays; token economics becomes a sub-section. (source: `briefs/2026-04-28.md`)
- Yesterday-yesterday's positioning doc explicitly warns: a "calm interface" pitch over a 12-verb wrapper API contradicts itself. Pivoting to a *third* frame in 48h compounds that incoherence. (source: `actions/2026-04-26-uipe-calm-tech-positioning.md`)
- Helicone owns LLM-app-level observability (requests, sessions, prompts, rate limits) but **does not attribute tokens to agent perception strategy** — that's a genuine wedge UIPE can occupy without picking a fight with a YC-backed incumbent. (source: https://www.helicone.ai)
- The 48-hour buying window is real (442↑ Reddit thread, Anthropic trust-collapse + Copilot 9x hike on the same day), but buying intent for token *observability* mostly flows to Helicone/Langfuse, not perception engines. UIPE's claim has to be specifically *"fewer agent retries → fewer tokens"*, which is a derivative metric, not a primary one.
- Current UIPE landing is a Next.js app at `~/uipe/ui-perception-engine/landing/`; the `landing/` dir is one of two write-allowed paths under the project guardrails (`landing/HOOKS.md`). Adding a section is mechanically cheap; the cost is the narrative whiplash, not the code.

## Existing players / prior art
- **Helicone** — request-level LLM observability; dashboards, sessions, alerts. Not agent-task-aware. (https://www.helicone.ai)
- **Langfuse** — open-source observability; trace/spans, evaluations. Same axis as Helicone.
- **OpenLLMetry / OpenInference** — OTel-based tracing for LLM apps. Even more upstream of "perception efficiency."
- **None of the above** measures *tokens-per-task as a function of how the agent perceives the UI.* That gap is the only honest claim to make.

## Concrete next steps for Dirk
1. **Kill the hero pivot.** Keep "Perception for autonomous agents" / CDC narrative as the lede. The brief's *Opportunity Sparks #3* already prescribes the reframe as a *value framing*, not a positioning replacement — use that.
2. **Run a real measurement before drawing a chart.** Pick the lazy-claude demo (`actions/2026-04-20-uipe-lazy-claude-demo.md`). Two runs of the same task: (a) DOM-dump-on-each-tick baseline, (b) UIPE `watch` + `compare_states`. Capture token counts from the model's usage object. ~45-90 min.
3. **If (2) shows a meaningful delta** (≥30% fewer input tokens), build *one* honest bar chart: "tokens-per-task, polling vs UIPE, lazy-claude demo, n=1." Add it as a "Token economics" section under the CDC pitch. One screenshot of the UIPE trace, one bar chart, real numbers, sample size disclosed. Caption: *"One demo, your mileage will vary; this is why the 9x hike is asymmetric."*
4. **If (2) shows no delta or is infeasible by EOD,** ship a 200-word post instead: "Polling the DOM was already wasteful. The 9x hike just made it expensive." Frame UIPE's CDC stream as the structural answer — same buying-window ride, no fabricated chart. Cross-post to HN/X.
5. **Cap total time at 2 hours.** The 48-hour window means *something*, but an unpolished, possibly-fictional dashboard mockup shipping at 11pm is worse than nothing. If the measurement isn't done by 4pm, downgrade to step 4 without remorse.

## Open questions
- Is the lazy-claude demo still wired up to log token counts? If not, instrumenting it is the gating dependency, not the chart.
- Does Helicone (or any prospect) actually parse "tokens-per-task by perception strategy" as a category, or does that framing need a 3-paragraph explainer before the chart lands? If the latter, the chart is premature regardless of the panic window.
- Is there a single named buyer in the 442↑ Reddit thread to DM with the post + chart? A pull from one credible reply > a landing-page broadcast for a niche perception claim.
