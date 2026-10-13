---
date: 2026-10-13
classification: research
action: Map Agent37's gVisor/RAM-packing cost model onto a hosted UIPE agent-session to find the MCPAASTA floor price.
source_brief: briefs/2026-10-13.md
---

## TL;DR
The floor price per UIPE agent-session is **a fraction of a cent** — roughly **$0.0003–$0.002 of metered compute** at Agent37's own published rates, which already bake in the gVisor/RAM-packing/Hetzner stack. If you keep a *warm* per-client UIPE instance alive, the cost collapses to a **fixed ~$0.36/mo disk floor** (mirroring their $0.37 paid tier), independent of session count. The uncomfortable takeaway: **infra is not your floor — it's noise.** The LLM tokens an agent burns per UIPE session dwarf the sandbox cost by 100–1000×. Pricing MCPAASTA off the infra floor is the wrong frame; price off value or token pass-through, and treat the sub-cent sandbox as a rounding error.

## Key findings
- Agent37 meters **$0.80/vCPU, $0.70/GB-RAM, $0.09/GB-disk per 730h month, by the minute; compute stops on sleep** (source: https://www.agent37.com/pricing). This is the gVisor/RAM-packing model expressed as a price sheet.
- Their headline **$0.37/mo** example = 2vCPU/4GB/4GB-disk at 7% uptime (57 hrs). Compute $0.34, disk $0.03. So active compute ≈ **$0.006/hr** for that shape.
- Derived per-session: 2vCPU/4GB active = **~$0.0001/min**. A 3-min browser-perceive session ≈ **$0.0003**; 10-min ≈ **$0.001**. Bump to 4vCPU/8GB (if UIPE runs a local vision model) ≈ **$0.0006–$0.002** (source: computed from rates above).
- **RAM is the bottleneck, not CPU** — and UIPE is RAM-heavy exactly where it hurts: "RAM only matters the day a project pulls in a headless browser" (source: HN 50059096, select1dev). gVisor overcommit is what makes this cheap; the tradeoff is no Docker-in-Docker / Android emulators.
- Free tier ($0.05–0.10/user/mo) is achieved **not by density but by capping awake hours to ~10/wk** (source: HN 50059096, vishnukool). The lever for a warm MCPAASTA instance is the same: idle-sleep aggressively.
- Multiple commenters flagged the space as a **race-to-the-bottom with no moat** (MikhailTal, mbesto, skeeter2020). Reinforces: don't compete on the infra floor.

## Existing players / prior art
- **Agent37** — gVisor sandboxes, $0.37/mo avg, 2.8× cheaper than boat.dev — https://agent37.com
- **boat.dev** — closest pricing competitor, more storage — https://boat.dev
- **engine.build sandbox list** — maintained comparison of ~31 providers — https://engine.build/lab/agent-sandboxes
- **Plimsoll** — credential broker outside the sandbox (scoped per-task tokens) — relevant to the UIPE *attestation* angle, not cost — https://github.com/plimsollmark/plimsoll

## Concrete next steps for Dirk
1. **Set the MCPAASTA floor at the warm-instance model, not per-session compute:** ~$0.36/mo disk + idle RAM per client, sessions effectively free. That's your true marginal cost ceiling.
2. **Decide UIPE's runtime shape** — does it call a hosted vision API (stays at 2vCPU/4GB, sub-cent) or run local CV/ML inference (8GB+, costs ~3×)? This single fork is 90% of the infra cost variance.
3. **Reframe pricing around token pass-through + a per-session margin**, since infra is <1% of the cost stack. The floor exercise proves infra can't be your differentiator — don't build the business on it.

## Open questions
- Does UIPE run a headless browser *and* local vision inference, or offload perception to an API? (Determines 4GB vs 8GB+ and whether CPU bursts matter.)
- What's a realistic UIPE session *duration* and *concurrency* per client? The warm-vs-ephemeral decision hinges on session frequency — rare sessions favor ephemeral, chatty agents favor warm.
