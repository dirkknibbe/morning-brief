---
date: 2026-08-10
classification: build-plan
action: Draft a one-paragraph UIPE MCP tool spec framed against browser-use's "agent can't tell if/when the UI changed" gap, noting where micropayment metering hooks in.
source_brief: briefs/2026-08-10.md
---

## TL;DR
browser-use's perception model is "act, then re-screenshot and let the LLM re-read the DOM." Its only timing primitive is `wait` — a blind *wait N seconds*. There is no first-class way for an agent to ask "did the UI actually react to my last action, and has it settled?" That is UIPE's exact wedge: expose it as a single MCP tool that blocks until the UI reaches a stable post-action state and returns a structured *perception delta* (what changed, when it settled, confidence), not a fixed sleep. Meter it per-call with x402 (HTTP 402 payment middleware) — charge per perception query, which maps cleanly onto the headroom "billed MCP call" pattern from today's brief. This is a genuinely differentiated primitive, not a wrapper; worth a 30-min spec and a spike.

## The one-paragraph spec (deliverable)
> **`uipe.await_settled`** — an MCP tool an agent calls immediately after any action (click/type/navigate). Input: `{ page_ref, since_action?, expect?: "text_appeared"|"element_gone"|"nav"|"any", timeout_ms, budget }`. It watches the live page (DOM mutation + paint/network signals + optional visual frame diff) and **blocks until the UI stops changing or `timeout_ms`**, then returns `{ settled: bool, latency_ms, delta: [{region, kind, before→after}], matched_expectation: bool, confidence }`. Unlike browser-use's `wait(seconds)`, the agent never guesses a sleep duration and never has to re-screenshot-and-reason to discover whether its action "took." **Metering hooks at the tool's HTTP boundary:** wrap the MCP endpoint in x402 `paymentMiddleware` so each `await_settled` call is a 402-gated, stablecoin-metered micropayment — per *perception query*, not per seat.

## Key findings
- browser-use's timing primitive is literally `wait` = "Wait for specified seconds" — a blind fixed sleep, no settle/change semantics (source: https://docs.browser-use.com/customize/tools/available).
- Its perception loop is screenshot + LLM DOM re-read (`screenshot`, `extract` are LLM-driven), so "did my action take?" costs a full model round-trip every step (source: same, plus README quickstart).
- x402 is a drop-in HTTP 402 `paymentMiddleware` — you annotate a route with price/description and it settles per-call across crypto/fiat rails. Maps directly onto per-query metering (source: https://github.com/coinbase/x402).
- The brief's own headroom precedent proves the model: sell a discrete unit of value (token savings there, *settled-perception* here) as a billed MCP call (source: briefs/2026-08-10.md).

## Existing players / prior art
- **browser-use** — act-first web agent, 108k★; the incumbent this is framed against — https://github.com/browser-use/browser-use
- **Playwright auto-waiting** — `waitForLoadState`, actionability checks; engine-level, heuristic, not exposed as an agent-perception primitive with a delta — https://playwright.dev
- **Visual-regression tools (Percy, Applitools)** — diff *screenshots across runs* for QA, not *live intra-session* "has it settled yet" — different job.
- **x402** — the metering rail, not a competitor — https://github.com/coinbase/x402

## Concrete next steps for Dirk
1. Paste the one-paragraph spec above into the UIPE repo as `docs/specs/await-settled.md`; it *is* the 30-min deliverable.
2. Decide the settle signal for the spike: DOM-mutation-quiet-window is the cheapest MVP; add paint/network + visual diff later. Ship the dumbest version that beats `wait(3)`.
3. Spike the x402 wrapper on a throwaway endpoint before touching UIPE internals — confirm the 402→pay→200 loop works with a stablecoin testnet, so metering isn't a surprise later.
4. Frame the pitch as "the `wait()` browser-use should have had" in any writeup — that's the whole positioning.

## Open questions
- Does an agent even *want* a blocking call, or a poll/subscribe (`on_settled` event)? Blocking is simpler to spec; streaming may fit MCP better — needs a design call.
- What's a defensible per-query price that beats "just sleep and re-screenshot" on cost? The metering only works if one `await_settled` is cheaper than the model round-trip it replaces.
- Can the settle signal be computed without a persistent browser extension/CDP session? That constraint decides whether this is a hosted service or a local sidecar.
