---
date: 2026-08-01
classification: build-plan
action: Sketch UIPE's perception endpoint as a Cloudflare Durable Object and estimate idle vs per-call cost at 10 / 100 / 1,000 agents to find the paid-MCP pricing floor.
source_brief: briefs/2026-08-01.md
---

## TL;DR
Construct's post is a clean costing template, and the answer it hands you is almost anticlimactic: for a **stateless** "did the UI change?" check, edge compute is effectively free at every scale you asked about. On Cloudflare's Workers Paid plan the marginal compute for 1,000 agents is **~$1–2/mo on top of the $5/mo base plan**; idle cost is **$0** by construction. The real catch: a stateless perception check does **not** want a Durable Object — a DO buys per-agent durable state and single-threaded coordination you don't need. Model it as a plain **Worker**. And the one variable that actually moves your floor isn't the DO at all — it's **whether each perception call runs an ML/vision model or a pure perceptual hash**. Pick pHash and your floor is ~$5/mo; a paid MCP at $50–100/mo clears ~99% gross margin at any scale up to thousands of agents.

## Key findings
- **Idle is genuinely $0.** DOs eligible for WebSocket hibernation are not billed for duration; Workers are invocation-billed. An agent that signs up and ghosts costs only the bytes of its stored state (SQLite storage, ~free under 5 GB). This is exactly Construct's "the bill only finishes when somebody actually works." (source: https://construct.computer/blog/running-ai-agents-on-cloudflare-not-vms/)
- **DO duration barely registers.** 128 MB allocation = 0.125 GB. At 80 ms active/call, that's 0.01 GB-s/call. 1,000 agents × 300 calls/day × 30 = 9M calls = 90,000 GB-s/mo — **under the 400,000 GB-s free tier.** Duration is free at all three tiers. (source: https://developers.cloudflare.com/durable-objects/platform/pricing/)
- **DO requests are the only line item that ever bills:** 1M/mo free, then $0.15/M. Only the 1,000-agent tier crosses it → 8M billable × $0.15 = **$1.20/mo.**
- **Construct's own ML gate is the tell:** they cap the memory/embedding pipeline at "$1 per 1,000 turns, excluding the primary chat model." If UIPE perception needs a vision model per call, that $1/1,000 order-of-magnitude is what dominates — at 9M calls that's ~$9k/mo, flipping the whole story. pHash/SSIM avoids it entirely.
- **Perception is the stateless half of Construct's split.** Their thesis: separate the agent loop (durable, DO) from the machine (stateless, summoned then killed). UIPE's perception check *is* the stateless machine half → it maps to a Worker/invocation, not a DO.

## Cost table (pHash path, 300 calls/agent/day, 80 ms active/call)
| Agents | Calls/mo | DO requests | Duration | Marginal $/mo | Idle $/mo |
|--------|----------|-------------|----------|---------------|-----------|
| 10 | 90k | free | free | $0 | $0 |
| 100 | 900k | free | free | $0 | $0 |
| 1,000 | 9M | $1.20 | free | ~$1.20 | $0 |

Plus a flat **$5/mo Workers Paid** base. Rescale by editing calls/agent/day — the model is linear.

## Existing players / prior art
- **Construct** — agent loop in a DO, Linux summoned per tool call via Sandbox SDK, R2-mounted workspace, hibernation for $0 idle — https://construct.computer/blog/running-ai-agents-on-cloudflare-not-vms/
- **camelAI** — hit the same "bill scales with signups not usage" wall and reached nearly the same DO conclusion independently (cited in the post).
- **Cloudflare DO pricing** — hibernation + active-CPU billing is the mechanism that makes idle free — https://developers.cloudflare.com/durable-objects/platform/pricing/

## Concrete next steps for Dirk
1. **Decide the algorithm first — it sets the entire floor.** pHash/SSIM in WASM (≈free) vs a vision model per call (meter against Workers AI pricing before anything else).
2. If pHash: build the endpoint as a **stateless Worker**, not a DO. Add a DO only if you want to cache each agent's last frame server-side so the client uploads one frame instead of two — it holds ~32 bytes and hibernates.
3. Benchmark real CPU-ms of pHash on an actual screenshot inside a Worker (30M CPU-ms/mo free on paid) to confirm it fits before committing.
4. Price at the $50–100/mo target with confidence: compute is <2% of revenue. Price on value (perception calls a browser-agent VM can't match on idle cost), not cost-plus.

## Open questions
- Does UIPE perception require ML inference per call, or is perceptual-hash sufficient for "did the UI change?" — this determines everything.
- Real calls-per-agent-per-day (assumed 300) and screenshot payload size per call (affects Worker ingress, currently assumed free).
