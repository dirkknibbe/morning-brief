---
date: 2026-11-03
classification: build-plan
action: Spin a ~30-line UIPE demo returning {value, fetched_at, status} for a live product page, feed it to Claude as a tool, show before/after on one of Apify's 15 test products.
source_brief: briefs/2026-11-03.md
---

## TL;DR
This is a strong, cheap demo and the gap is already quantified for you — build it. But the honest framing beats the naive one: a *pure* 30-line DIY fetcher (regex over raw HTML) will **not** reliably read prices on Amazon/Walmart/Best Buy — Apify's own DIY scraper hit 26 block pages in 3 runs. That failure is the point: a status-aware tool returns `status:"blocked"` instead of a confident wrong number, and that alone killed 45.3%→0% of fabrications in the preprint. For the "we got the price *right*" half of the before/after, back the tool with the free Apify Actor (free tier = $5/mo, hundreds of checks). Strongest tweet is a 3-way: no tool → confident wrong price; DIY tool → honest "blocked"; grounded tool → correct price + `fetched_at`. One caveat: the brief says "Claude Opus 5.5" — that model doesn't exist; use `claude-opus-4-8`.

## Key findings
- Apify's post (the one the brief cites) ships the exact shape you want: `offers.price`, `offers.priceCurrency`, `url`, `scrapedAt` — uniform across stores. Map that → `{value, fetched_at, status}`. (source: https://blog.apify.com/llm-grounding-with-live-data/)
- Ready-made before/after: Dyson V15 Detect at Best Buy, live $899.99 — Claude *with web search* answered `{"price": 629.99, "source_url": ".../J3ZCSY279C"}`, a link to a *different* product. Wrong price that looks correct because it cites a source. (source: same)
- The real win isn't live data, it's **status**: built-in web search still gave 5–8/15 wrong prices, each with a source link. Only an explicit status/error lets *code* (not the model) flag a bad page. (source: same)
- You already own the DIY fetcher: `src/web-fetch.ts` exports `fetchAsText(url)` and **throws on non-200** — that's the status-aware primitive. No new fetch code needed for variant A. (source: repo)
- Free: Apify Free plan = $5 usage/mo, "hundreds of live price checks"; Actor is `apify/e-commerce-scraping-tool`, `scrapeMode:AUTO`. The LLM call itself costs cents (your Max/Anthropic key). (source: Apify post)

## Existing players / prior art
- Apify E-commerce Scraping Tool — the grounded-data backend, already the reference impl of this exact pattern (in Python). — https://blog.apify.com/llm-grounding-with-live-data/
- Momentic "Mo" (brief, Hot Signals) — "verification belongs in the agent loop"; adjacent thesis, QA-flavored.
- Pondero/Lindy pricing test — every wrong price = annual-vs-monthly / currency confusion; reinforces "code writes the number, not the model." — https://pondero.ai/agents/guides/ai-agent-pricing-research-accuracy-test/

## Concrete next steps for Dirk
1. **First PR — `src/uipe-demo.ts` (~40 lines):** `getLivePrice(url) → {value, fetched_at, status, source_url}`. Variant A: wrap `fetchAsText` + a price regex; return `status:"blocked"|"no_price"|"ok"` (never guess). Leave a one-line hook to swap the fetch backend for the Apify Actor (variant B).
2. **Harness — `scripts/uipe-claude-demo.ts`:** raw `fetch` to `https://api.anthropic.com/v1/messages` (no SDK dep — repo already proves bare `fetch` works), model `claude-opus-4-8`, one `get_live_price` tool. Run the Dyson V15 Best Buy URL twice: tool disabled vs enabled. Add a 3-line validator: reject the answer if its number ≠ tool output.
3. **Capture the before/after** to `actions/` or a gist: no-tool answer (confident wrong), DIY answer (`status:"blocked"`), Apify-backed answer (correct + `fetched_at`). That's the tweet.

## Open questions
- Does Best Buy's product HTML expose the price to a plain `fetchAsText` (likely JS-rendered → variant A returns `no_price`)? Confirm with one run before picking the demo product; if DIY always blocks, lead with a Shopify store (static) for variant A and Best Buy for variant B.
- Is "feed to Claude" worth an LLM call at all for the tweet, or is the stronger artifact just the tool output vs the model's unaided guess side-by-side? (Cheaper, same point.)
