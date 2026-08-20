---
date: 2026-08-20
classification: build-plan
action: Clone Headroom, run its compressor on one real UIPE DOM-state payload, check for 40%+ token cut with no signal loss
source_brief: briefs/2026-08-20.md
---

## TL;DR
**You already researched this — the answer is "no," and today's brief re-surfaced a settled question.** See `actions/2026-07-29-uipe-headroom-payload-compression.md`. Today's target ("40%+ *with no signal loss*") is self-contradictory for UIPE + Headroom: Headroom's big JSON numbers come almost entirely from SmartCrusher **statistically dropping ~95% of array rows** (1000 → ~50, `max_items_after_crush=50`). A UIPE screen has ~20–150 elements — usually *under* the drop threshold, so row-sampling yields ~0%; and any element it does drop is exactly the one a perception/verdict engine must keep. So you get either <35% (lossless field-trimming, threshold not engaged) or 40%+ *with* signal loss. Not both. **Don't re-run the same 20-min test expecting a new answer.** The one genuinely open gate is unchanged from July 29 and is worth 10 minutes: does any UIPE surface actually feed the element list to an LLM? If not, this whole thread is moot.

## Key findings
- July 29 confirmed the payload is `VisionAnalyzeResponse.elements: VisionElement[]` — small array of ~6-field dicts + a `png_base64`. That's SmartCrusher's shape, but not its *volume*. (source: actions/2026-07-29-uipe-headroom-payload-compression.md)
- Headroom's 60–95% = lossy row-sampling, not lossless columnar packing (`min_tokens_to_crush=200`, keeps ~50 of 1000). Below ~50 items → ~0% from that path. (source: same, citing headroom-docs.vercel.app/docs/smart-crusher)
- Content router has compressors for JSON / code / logs / diffs / text — **no HTML/DOM compressor.** If a payload is ever raw markup it routes to the prose model (15–20%), also missing 40%. (source: https://raw.githubusercontent.com/headroomlabs-ai/headroom/main/llms.txt)
- **New since July 29:** there's now a TS SDK — `bun add headroom-ai`, call `compress()`. If you *do* re-measure, do it in-repo; no `pip`/`uv` needed. (source: llms.txt / npmjs.com/package/headroom-ai)
- The real token lever is the `png_base64`, not the element list — and "don't send base64 to a text model" captures most of that for free, no dependency. (source: July 29 dossier)

## Existing players / prior art
- **Headroom** (`headroomlabs-ai/headroom`) — Apache-2.0 context compressor; library + proxy + MCP — https://github.com/headroomlabs-ai/headroom
- **Your own prior research** — `actions/2026-07-29-uipe-headroom-payload-compression.md`, `2026-08-02-deerflow-headroom-uipe-mcp-packaging.md`, `2026-08-13-headroom-mcp-metered-billing.md`. This is the 4th Headroom+UIPE action; the beat keeps re-proposing it.
- **headroom-benchmarks** (shreyassks) — independent 44% on a *tabular* MCP/SQLite fixture (high row count) — the volume UIPE lacks — https://github.com/shreyassks/headroom-benchmarks

## Concrete next steps for Dirk
1. **Answer the gate, not the compressor (10 min):** grep UIPE for any surface that serializes `elements` into an LLM prompt. If every consumer is the mechanical Rust diff, token cost is zero and you can close this thread permanently.
2. If (and only if) an LLM-facing surface exists: `bun add headroom-ai`, `compress()` one live payload, and **diff kept-vs-original elements**. Decision gate: any dropped element a verdict keys on = disqualified. Expect ~15–35% lossless.
3. Retire the "token-cost story / bundling target" framing. On two rounds of evidence it's a quiet efficiency win at best, not a differentiator or a metered SKU.

## Open questions
- Does any UIPE surface feed the element payload to an LLM, or is every consumer mechanical? (Still unanswered after two rounds — this is the actual blocker.)
- Is element count per real screen ever >200, where SmartCrusher's row-sampling would even engage?

---
_Parser note: `bun run src/parse-action.ts` exited 1 — the brief heading `✅ *One action today*` is colon-less with the action on the next line, but `parse-action.ts:34` requires a colon after the bold span. Extracted the action manually. The colon-less-heading fallback is worth restoring (see gotchas)._
