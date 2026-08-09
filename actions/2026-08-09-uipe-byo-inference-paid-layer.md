---
date: 2026-08-09
classification: research
action: Read the "free, BYO inference" MCP pricing pattern + deer-flow's gateway design; sketch where UIPE's paid layer sits.
source_brief: briefs/2026-08-09.md
---

## TL;DR
The exact "Revise MCP" name looks brief-side, but the *pattern* it points at is everywhere and unambiguous: **give away the protocol + reference server, never meter inference (user brings their own key), charge for the scarce layer above.** deer-flow's "gateway" is literally this — a `config.yaml` + `.env` where you plug in *any* LLM provider (OpenAI, OpenRouter, Claude Code OAuth, Codex CLI) through a LangChain pass-through; the harness is free, the user pays the provider directly, and DeerFlow's only cost feature is an *optional meter* it never bills on. Applied to UIPE the lesson is sharp: **perception inference is the commodity you give away, not the thing you sell.** Push the vision/LLM judgment to the agent's own key (Refract already does this via MCP `sampling`), and monetize the one thing an agent can't bring itself — the **signed, timestamped perception receipt / attestation.** Inference is BYO; the receipt is the toll.

## Key findings
- deer-flow's gateway = per-model config with `api_key: $OPENAI_API_KEY` / `base_url` per provider; wizard writes keys to *your* `.env`. Optional per-model pricing exists only to *display* cost, and is disabled on mixed currencies rather than billed. Pure pass-through, zero inference margin taken. (source: raw.githubusercontent.com/bytedance/deer-flow/main/README.md)
- **Refract is near-exact UIPE prior art**: an MCP server exposing a diff/boundary engine (`revert`, `sentence_similarity`, `heuristic`, `template_signal`, `activity_spike`) that uses MCP `sampling` to "request the host's LLM to interpret events at any BYO-inference boundary *without managing API keys*." That is UIPE's "did the UI change / did my action succeed?" check with the inference cost already externalized. (source: refract-org.github.io/refract-docs/mcp/)
- MCPWorks packages the whole model as a license: full platform BSL 1.1 (→ Apache 2.0 after 4yr), free self-host with no agent/exec limits, **BYOAI across 14+ providers ("we never proxy your tokens")**, paid only for managed Cloud. "Charges for infrastructure — containers, scheduling, state — not for intelligence." (source: mcpworks.io/pricing)
- The economic logic (Hatchable): a free tier can be *genuinely* free only when the platform isn't paying for inference — "hosting is a commodity that can be free forever; AI isn't. Unbundling makes the hosting half scale." This is exactly the 08-01 finding that a *stateless* pHash perception check is ~$0 at the edge, but a *vision-model* check flips to ~$9k/mo at 9M calls. BYO-inference is how you dodge that flip. (source: hatchable.com/articles/what-is-bring-your-own-ai)

## Existing players / prior art
- Refract — MCP boundary/diff engine, BYO-inference via `sampling` — closest structural twin to UIPE — https://refract-org.github.io/refract-docs/mcp/
- MCPWorks — BSL open-core + BYOAI + paid Cloud; the licensing template — https://www.mcpworks.io/pricing/
- deer-flow — free harness, LLM-gateway config as pure pass-through — https://github.com/bytedance/deer-flow
- headroom — open-core, no per-call toll (from 08-02); the counter-example that says *don't* half-toll a local capability

## Concrete next steps for Dirk
1. **Draw the line at the receipt, not the inference.** Free + open-source: the UIPE spec, the reference MCP server (`uipe_perceive` / `uipe_retrieve` / `uipe_stats`), and the perception *judgment* run via MCP `sampling` on the agent's own key. Copy Refract's boundary-via-sampling verbatim — it's proven and it zeroes your inference bill.
2. **Sell the trust anchor.** The paid layer = the *signed, timestamped* perception receipt (today's brief's "agent receipt verifier") — hosted attestation, settlement/x402 rail, org dashboards, audit export. You can BYO a model; you cannot BYO a neutral third-party signature. That's the defensible toll.
3. **Adopt MCPWorks' license shape**: BSL 1.1 → Apache after 4yr on the server, so self-host is free-forever but nobody resells hosted-UIPE-as-a-service against you.
4. Write the one-line pricing promise now: *"UIPE is free and runs on your own inference. You pay only when you need a receipt someone else will trust."*

## Open questions
- Does the signed-receipt tier have enough standalone value if the perception judgment is fully client-side/BYO — i.e. will agents pay for attestation without also paying for the compute?
- Is there a genuine can't-run-client-side case (heavy GPU vision) that justifies a *hosted-perception* tier alongside the receipt, or does BYO-inference cover 95% and you should resist building it (YAGNI)?
