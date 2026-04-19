---
date: 2026-04-19
classification: build-plan
action: Spin up Qwen 3.6-35B-A3B locally and wire it to UIPE as a fallback inference path
source_brief: briefs/2026-04-19.md
---

## TL;DR
The "2 hours to viability" timeline collides with your hardware: the 79 t/s number in the brief came from an RTX 5070 Ti desktop, not a 2019 Intel MBP with an AMD Radeon Pro 5500M (8GB VRAM, no CUDA). A 30B MoE at Q4 is ~19GB — it *fits* in 32GB RAM, but you'll be CPU-bound at single-digit to low-teens t/s. More importantly, the action conflates two projects: **Spark #1 is a Claude-proxy router**, not a UIPE feature — UIPE is a perception MCP, it doesn't do the reasoning that gets refused. Recommended pivot: 30-min Ollama smoke test today to baseline t/s on your actual hardware, then scope the fallback router as a **standalone proxy** (separate repo) with Qwen behind it — keep UIPE out of it.

## Key findings
- Actual Ollama tag is `qwen3:30b-a3b` (MoE, ~3B active params, ~19GB Q4) — the "3.6-35B" framing from r/LocalLLaMA is a thread shorthand; no `35B-A3B` exists on Ollama (source: https://ollama.com/library/qwen3).
- Your Mac: Intel i9-9980HK + Radeon Pro 5500M 8GB + 32GB RAM. No CUDA. Metal works via Ollama but AMD + Intel Mac is the worst-supported path — GPU offload capped by 8GB VRAM, rest spills to CPU.
- UIPE already has Ollama plumbing (`src/config.ts:6-8`) but it's pointed at `llava:7b` for **vision**, not a text LLM. Adding a second model endpoint is trivial; what isn't trivial is defining *what UIPE would do with text-LLM inference* — its job is to hand scene graphs to Claude Code, not reason over them.
- Refusal triggers from this week's HN/Reddit material: "I can't help with that", "this might be malicious", "I'm not comfortable", "let me check this isn't malware", "this looks like it could be used to…" — all pattern-matchable in a thin proxy.
- Qwen3-Next-80B-A3B is already served cheaply by Novita at $1.50/M output tokens at 69 t/s (source: https://huggingface.co/Qwen/Qwen3-Next-80B-A3B-Instruct) — for fallback-router POC, pointing at a hosted Qwen endpoint beats local inference on your hardware and costs nothing meaningful at dev volumes.

## Existing players / prior art
- *Ollama* — de facto local runner, already in UIPE — https://ollama.com/library/qwen3
- *LiteLLM* — proxy/router with fallback chains built in; worth stealing the routing abstraction — https://github.com/BerriAI/litellm
- *OpenRouter* — already does refusal-tolerant model swapping at the API layer; "why self-host" is a real question for the router idea.
- *Novita / Featherless* — hosted Qwen3-80B-A3B at <$2/M tokens; changes the "local or bust" framing.

## Concrete next steps for Dirk
1. **30-min hardware smoke test (today if you want):** `ollama pull qwen3:30b-a3b && ollama run qwen3:30b-a3b` on a 2k-token code-gen prompt. Measure t/s and time-to-first-token. If < 8 t/s or TTFT > 10s, local path is DOA on this Mac — move on.
2. **If local is unusable, don't force it.** Point the fallback router at Novita's hosted Qwen3-80B-A3B ($1.50/M output). The product thesis is *"never see a refusal again,"* not *"it runs on your laptop."* The laptop story is a future-Mac-Studio story.
3. **Scope Spark #1 as a new repo, not a UIPE feature.** It's an Anthropic-API-shaped proxy that sniffs assistant deltas for refusal tokens and restarts the stream against Qwen mid-completion. UIPE is orthogonal — don't entangle them.
4. **Harvest refusal patterns from this week's HN thread** (the malware/scraper one) into a `refusal-patterns.json` fixture — that's the actual moat, not the inference backend.
5. **Write a 1-page one-pager** (problem → wedge → pricing → MVP scope) before any code. The $10/mo × devs-frustrated-with-4.7 math is the decision gate, not feasibility.

## Open questions
- Does Anthropic's ToS permit a proxy that *silently* reroutes a paid Claude call to a different model? (Probably yes for self-hosted, grey for a SaaS selling it.)
- Is mid-stream model swap on refusal actually invisible to the end user, or does Claude Code's client assume a single backend per session?
- What's the refusal false-positive rate? Claude saying "I can't help with that *specific framing*, try rephrasing" is a feature, not a refusal — the proxy must not hijack those.
