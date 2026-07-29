---
date: 2026-07-29
classification: research
action: Measure UIPE's UI-state payload token cost, then pipe one snapshot through headroom (Apache-2.0, MCP) — if UI JSON hits the 60–95% claim, it's either a differentiator or a metered add-on to price.
source_brief: briefs/2026-07-29.md
---

## TL;DR
UIPE's payload (`VisionAnalyzeResponse` in `packages/contracts/src/index.ts`) is `elements: VisionElement[]` — an array of near-identical dicts `{label, confidence, bbox, text?, is_interactable?, description?}` plus a `png_base64`. That IS the shape headroom's SmartCrusher targets, so the fit looks great on paper. **It isn't.** Headroom's 60–95% comes almost entirely from *statistically dropping ~95% of array rows* (keeps ~50 of 1000 items; `min_tokens_to_crush=200`, `max_items_after_crush=50`). A UI screen has ~20–150 elements, not 1000 — usually under the drop threshold, so row-sampling yields ~0%. Worse, dropping elements is fatal for a *perception/verdict* engine: the element SmartCrusher discards is exactly the one whose change UIPE must detect. **Recommendation: don't price a metered add-on on borrowed 60–95% numbers.** Run the one real measurement (below); expect ~15–35% lossless-ish savings, and treat it as a quiet efficiency win, not a product.

## Key findings
- **Payload = array of dicts + a base64 image.** `VisionAnalyzeResponse.elements: VisionElement[]`; each element ~6 fields, ~40–50 tokens. An 80-element screen ≈ ~3.5k text tokens; the `png_base64` dwarfs it if it ever hits a multimodal model. (source: ~/uipe/.../packages/contracts/src/index.ts)
- **SmartCrusher's savings are lossy row-dropping, not lossless columnar packing.** It scores items (errors/anomalies/first-last/query-relevant) and samples the rest — "1000 items → ~50." (source: https://headroom-docs.vercel.app/docs/smart-crusher)
- **The headline number needs volume UIPE doesn't have.** Below `max_items_after_crush=50`, nothing is dropped → 0% from SmartCrusher; remaining savings are field-level (trimming long `description`/`text`), which the JSON path lists at the *low* end. (source: github.com/chopratejas/headroom/blob/main/docs/transforms.md)
- **Lossy compression contradicts UIPE's whole value prop.** UIPE sells "independent verifier, every element is evidence." A compressor that samples away 95% of elements can't sit in the verdict path. It could only sit on an *outbound-to-an-agent* surface — and even there, hiding the target button is a correctness bug. (source: actions/2026-07-27-uipe-signed-perception-receipts.md)
- **Token cost only bites where the payload enters an LLM.** UIPE's own structural/temporal diff is mechanical (native Rust in `target/release`) — zero LLM tokens. Compression is irrelevant there; it matters only if a downstream agent consumes the element list. Confirm that surface exists before pricing it. (source: ~/uipe core pipelines)
- **Bigger lever than SmartCrusher: the image.** `png_base64` is the real hog. Headroom's image path claims 40–90%, but "just don't send base64 to a text model" captures most of that for free. (source: github.com/chopratejas/headroom README)

## Existing players / prior art
- **headroom** (chopratejas/headroom) — Apache-2.0, MCP/proxy/library context-compression layer; SmartCrusher (JSON), CodeCompressor (AST), image router, CCR reversible store. — github.com/chopratejas/headroom
- **CCR (reversible compression)** — stores originals, LLM calls `headroom_retrieve` on demand — helps an LLM-in-loop, not UIPE's deterministic diff. — https://headroom-docs.vercel.app/docs/ccr

## Concrete next steps for Dirk
1. **The one real measurement (20 min):** capture a live `VisionAnalyzeResponse` from a busy screen, `pip install headroom-ai`, run `SmartCrusher().crush(payload, query=...)`, read `savings_percent`, and **diff the kept elements against the original**. Decision gate: if it drops any element a verdict would key on, headroom is disqualified from the verdict path — full stop.
2. If savings are real *and* lossless on a real screen, scope it as **UIPE-owned lossless packing** (element dedup + bbox integer-quantize + strip base64 for text consumers), not a headroom dependency and not a metered SKU.
3. Kill the "metered add-on" framing unless step 1 shows both >30% savings *and* an actual outbound-to-LLM surface with volume. On today's evidence, it's neither a differentiator nor a priced product.

## Open questions
- Does any UIPE surface actually feed the element payload to an LLM, or is every consumer mechanical? (If mechanical, token cost — and this whole action — is moot.)
- Typical element count per real target screen — is it ever >200 (where row-sampling would even engage)?
