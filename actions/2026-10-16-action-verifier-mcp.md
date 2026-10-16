---
date: 2026-10-16
classification: build-plan
action: "Action verifier MCP — hosted BlastLoop-T3 'did my agent's web action actually succeed?' adversarial check, per call."
source_brief: briefs/2026-10-16.md
---

## TL;DR
Don't build this as a standalone hosted per-call MCP. "Did my web action succeed?" verification already ships as a first-class primitive inside every serious web-agent framework (Skyvern's `page.validate()`, Stagehand's `observe()`/`extract()`), because verification needs two things the agent already holds: the *intended outcome* and the *resulting page state*. Worse, it breaks the economics that make sifty work: sifty never ingests the page (URL-only), but a verifier must be handed the post-action DOM/screenshot — so there's no token saving to sell, just a round-trip you added. The sharp move is the brief's own line 28: sell the **temporal** axis (UIPE "is this UI ready / changed since T"), which nobody owns, rather than the verification axis, which everybody already does in-loop.

## Key findings
- BlastLoop's "T3 adversarial" is a gate on **code** (edge cases, race conditions, rollback paths), not on live web actions — the brief borrows the *framing*, not a transplantable component. (source: https://github.com/rlshaw-ml/BlastLoop)
- Skyvern exposes `page.validate(prompt) -> bool`, documented with the exact example "Check if user is logged in" — i.e. "did my action succeed" is already a one-liner inside the agent. (source: https://github.com/Skyvern-AI/skyvern)
- Stagehand's `act()` self-heals and `extract()` returns Zod/schema-validated state, so the agent reads back the result it just caused — verification is in-loop by construction. (source: https://github.com/browserbase/stagehand)
- Economics inversion vs. sifty: sifty's pitch is "the page never enters your context." A verifier's input *is* the page (DOM/screenshot/intent), so it cannot save context — it adds a network hop for a judgment the agent can make locally. (source: briefs/2026-10-16.md lines 3, 15)
- The real unsolved gap the brief keeps circling is *time*: "200 OK on a dead page" and "has this UI changed since last visit" — a temporal/readiness signal, not a success/fail judgment. (source: briefs/2026-10-16.md lines 11, 28)

## Existing players / prior art
- Skyvern — vision web agent with built-in `page.validate()` boolean state checks — https://github.com/Skyvern-AI/skyvern
- Stagehand (Browserbase) — `act`/`observe`/`extract` with schema-validated read-back — https://github.com/browserbase/stagehand
- browser-use — open-source agent with structured output models asserting task completion — https://github.com/browser-use/browser-use
- sifty — the per-call MCP primitive that *does* work, because it stays out of context — sifty.dev

## Concrete next steps for Dirk
1. Kill the standalone verifier idea — write one line in the ideas log: "verification is in-loop; it can't beat the sifty context-saving test." Don't spend an afternoon prototyping it.
2. Instead, do the brief's line-32 experiment (curl sifty against 3 UIPE pages incl. one JS-gated) to pin down the *temporal/readiness* blind spot — that's the defensible primitive.
3. If you still want a verification product, package it as a **library/eval-harness contribution** to browser-use or an MCP that wraps Skyvern's `validate` — not a paid hosted endpoint competing with a built-in method.

## Open questions
- Parser caught line 30 (`*Action verifier MCP*:`) before line 32's real `✅ *Action today:*` — the "action"+colon bold span on an Opportunity Spark bullet wins. Worth a fix so research targets the designated action, not the first matching bullet.
- Is there *any* per-call framing where verification pays for itself (e.g. a trusted third-party "proof of outcome" an agent presents to a payer, à la x402/proof-of-intent)? That's a trust/attestation product, not a token-saving one — different thesis, maybe worth a separate spark.
