---
date: 2026-07-06
classification: build-plan
action: Draft a flat-rate ("no per-call meter") pricing page for UIPE MCP lifting yolo-auto's framing, to test whether anti-metering is the wedge before building billing.
source_brief: briefs/2026-07-06.md
---

## TL;DR
The instinct is right: **test the message before building the meter.** A fake-door pricing page is the correct, cheap way to find out if "no token math" pulls UIPE demand. But be precise about *what* you're copying. yolo-auto can offer true unlimited because it self-hosts one MoE model (3B active params) on owned bare metal — near-zero marginal cost per call. Every AI product that resold *metered upstream* compute at flat rate (Copilot, Cursor, Windsurf, even Anthropic's own subs) has retreated to usage-based billing because heavy/agentic users are power-law distributed and torch the margin. **So: run the demand test lifting yolo-auto's *framing*, but do not build unlimited *billing* until you know UIPE's marginal cost per perception tick.** That one fact decides whether flat-rate is a moat or a trap.

## Key findings
- yolo-auto's flat-$6 works on cost structure, not pricing genius: sparse MoE (35B total / 3B active) on leased bare metal, "computational cost of a tiny 3B model per token" (source: https://yolo-auto.com/about). Not replicable by anyone paying a per-call upstream meter.
- Its actual copy to lift: "No per-token meter, no surprise bills… Cancel anytime… Works with anything OpenAI-compatible" + a Free tier (15 req/wk) as the funnel. Even *it* caps concurrency (2 slots) and hedges "unlimited* subject to terms" (source: https://yolo-auto.com/pricing).
- Flat-rate + unbounded compute = adverse selection: your most engaged users are your most expensive; "companies that shipped flat-rate AI products almost universally add caps or credits within the first few months" (source: https://www.paulserban.eu/blog/post/why-ai-pricing-is-hard...).
- The whole coding-tool category already ran this experiment and quit: GitHub Copilot retired flat Premium requests for usage-based AI Credits on 2026-06-01; Cursor/Windsurf same direction (source: https://wilico.co.jp/en/blog/end-of-flat-rate-ai-github-copilot-llm-billing-shift).
- "Agentic workloads need API billing… you cannot offer flat pricing for unbounded compute" — but the *anti-meter anxiety* is real demand, which is exactly why the message tests well even when the model doesn't (source: https://dev.to/piiiico/the-flat-subscription-problem-why-agents-break-ai-pricing-h1j).

## Existing players / prior art
- **yolo-auto** — flat $6/mo unlimited Qwen, the template you're lifting — https://yolo-auto.com/
- **GitHub Copilot / Cursor / Windsurf** — all *abandoned* flat-rate for metered credits; the cautionary tale — see wilico link above.
- **Anthropic subscriptions** — added weekly caps after some users burned "tens of thousands" against flat plans (source: https://www.implicator.ai/claudes-rate-limits-arent-a-capacity-problem-theyre-a-math-problem/).

## Concrete next steps for Dirk
1. **Answer the one gating question first:** what is UIPE's marginal cost per perception tick? If perception is a deterministic/self-hosted CV pipeline (cheap), flat-rate is genuinely viable and yolo-auto is a real template. If each tick proxies a metered vision LLM, flat-rate unlimited is a margin trap — proceed to a *demand test only*, not a billing model.
2. **Ship a fake-door page, not a product.** Static page on dirkdevelops/Vercel: lift yolo-auto's framing, one "Get early access" email capture, no Stripe. Instrument clicks + emails. This is the "test the wedge before billing" the action asks for — zero billing code.
3. **Frame the offer as flat-rate-with-a-fair-cap** even in the test (e.g. "unlimited perception calls, 2 concurrent, cancel anytime"). Copy yolo-auto's own hedges — they prove even the true-believers cap concurrency.
4. **Set a kill/go bar before launching:** e.g. ≥X email signups or ≥Y% CTR from the UIPE audience in 2 weeks → design hybrid billing (fixed base + overage), the format that actually survives. Below bar → anti-metering isn't UIPE's wedge; drop it.

## Open questions
- **UIPE's real unit cost per call** — unanswerable from here; it's the hinge of the whole decision. Pull it from the UIPE repo/telemetry before writing any billing.
- Who is the UIPE buyer feeling "meter anxiety" today — is there enough live usage to even run a demand test against, or does the test need a cold-audience landing page?
