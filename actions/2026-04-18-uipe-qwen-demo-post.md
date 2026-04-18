---
date: 2026-04-18
classification: human
action: Post a 60s UIPE + local Qwen 3.6 demo video as a comment on the Qwen 3.6 r/LocalLLaMA thread, and to r/ClaudeAI
source_brief: briefs/2026-04-18.md
---

## TL;DR
The r/LocalLLaMA thread is the right target but smaller than the brief claimed — currently **302 score / 107 comments / ~1 day old** (not ~810). Still a viable placement. **Skip r/ClaudeAI today**: the top of that sub is Opus 4.7 + Claude Design launch with 1.8k+/1.2k+ scores, and a local-Qwen demo reads as off-topic and will get drowned. Comment should lead with the demo, not the pitch — top comment on the Qwen thread right now is "every release same posts" (301 score), so hype-fatigue is real.

## Key findings
- Target thread: `/r/LocalLLaMA/comments/1so2nt9/qwen_36_is_the_first_local_model_that_actually/` — 302 score, 107 comments, OP running Q8 on 5090+4090 at 170 tk/s. (source: reddit JSON)
- Top comment is snarky dismissal of hype posts ("every release same posts" @ 301) — the same audience genuinely rewards *concrete demos*. E.g. "watching Hermes-Agent work with unlimited amount of tokens at >100tk/s with this model is kinda scary..." (kmp11, +13). That's the exact lane UIPE fits into. (source: reddit JSON)
- r/ClaudeAI top today: Claude Design (1875), Opus 4.7 memes (1796), Claude Design vs Figma drama (1230). "Built with Claude" flair posts are landing in the 40-50 range. A Qwen-agent demo in r/ClaudeAI during an Anthropic launch day is off-brief and off-audience. (source: reddit JSON)
- The Qwen 3.6 thread has active threads about agent frameworks, Hermes-Agent, opencode function-calling — UIPE's "temporal screenshots → agent sees its own build" pitch slots cleanly into that conversation.
- Thread is ~20h old, ~1000 comments/day subreddit velocity — post within 3-4 hours or it falls off the first page.

## Existing players / prior art
- **Hermes-Agent** — mentioned in-thread as "kinda scary" watching it run at >100 tk/s with Qwen 3.6. Positions UIPE as visual-layer complement. — (reddit comment)
- **opencode** — in-thread user reports Qwen 3.6 function-calling works "without failing once" there. Good demo baseline: show UIPE running a Qwen agent via opencode, screenshots feeding back. — (reddit comment)
- **playwright-mcp** (Microsoft, 30k stars) — the obvious commoditized alternative. Demo needs to show *why* temporal/diff-aware screenshots beat raw DOM snapshots. — (prior brief 2026-04-09)

## Concrete next steps for Dirk
1. **Record the 60s clip this evening.** Golden path: Qwen 3.6 in opencode, task is "fix the broken flexbox in this landing page," UIPE feeds a screenshot after every edit, show the agent noticing its own regression and self-correcting. Silent screen capture + on-screen captions — Reddit autoplays without sound.
2. **Post as a top-level comment on the Qwen thread, not a new post.** Copy: *"Been building a UI-perception MCP — gave it to a local Qwen 3.6 agent iterating on a landing page. Temporal screenshots after each edit, agent uses them to verify its own work. 60s clip: [video]. Q8 on a single 4090, ~80 tk/s. [repo link at the end, one line, no fanfare]."* No em-dashes, no "excited to share" — the subreddit eats that alive.
3. **Do NOT crosspost to r/ClaudeAI today.** Park it; post there next week with "Built with Claude" flair, reframed as "UIPE is built *using* Claude Code — here's a video of Claude and Qwen collaborating via UIPE." Different narrative, right audience.
4. **Stand up a standalone r/LocalLLaMA post 48h later** if the comment lands well — same video, different framing ("UI-perception MCP for local agents — 60s demo with Qwen 3.6"). Lets the thread momentum compound.

## Open questions
- Is UIPE's temporal-screenshot MCP shippable-as-demo today, or is the clip going to require hand-waving? (Couldn't answer from repo state — you know.)
- Does the repo have an install-in-30-seconds path? Comment link needs to convert curious viewers, not dump them in a README.
- Is there a reason *not* to name competitors (playwright-mcp, Hermes-Agent) in the comment body? Naming them signals you've done the work; hiding them signals marketing.
