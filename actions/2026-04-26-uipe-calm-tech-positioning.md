---
date: 2026-04-26
classification: build-plan
action: Write a 1-page UIPE positioning doc that stitches Feldera's "calm tech for machines" thesis into MCPAASTA.
source_brief: briefs/2026-04-26.md
---

## TL;DR
Feldera handed you the exact vocabulary: **Weiser's "calm technology" → "calm tech for machines"** as a thesis statement, plus three "established" agentic patterns (CLI, specs, reconciliation loops) and one new one (CDC streams instead of polling). The cleanest UIPE pitch in that frame is one sentence: *the DOM is a database; UIPE is its CDC stream*. `watch` + `compare_states` already emit precise "this changed" events — that's literally CDC for UI. MCPAASTA's per-call metering then becomes a *message-coherent* business model (you only pay when something interesting happens), not just a billing scheme bolted on. **Caveat:** this positioning is honest only if yesterday's reframe (shrink the 12-tool API to a perception kernel — see `2026-04-25-uipe-as-skill-not-framework.md`) is reflected. A "calm interface" pitch over a 12-verb wrapper API contradicts itself.

## Key findings
- Feldera's actual phrasing: "calm technology, but for machines" — anchored on Weiser's 1991 *Computer for the 21st Century* (quoted directly: *"the most profound technologies are those that disappear"*). Three named patterns are CLI / declarative specs / reconciliation loops; the proposed fourth is CDC. (source: https://www.feldera.com/blog/ai-agents-arent-coworkers-embed-them-in-your-software)
- Feldera's diagnosis of chatbots maps 1:1 to UIPE's complaint about polling DOM dumps: *"agents have to poll, diff, and guess what changed by running expensive queries."* Replace "queries" with "DOM snapshots" — same sentence. (source: same)
- UIPE already implements two of Feldera's three established patterns: a CLI surface and a watch/diff reconciliation loop (`watch`, `stop_watch`, `compare_states` per `~/uipe/ui-perception-engine/README.md`). The unclaimed pattern is "specs" — useful as future-state pitch, not current product.
- "MCPAASTA" across recent briefs = paid hosted MCP with per-call/per-run metering (x402-style or subscription). The **change-event** unit is the natural billing unit if you adopt CDC framing — solves the "what do we charge for?" question that has dogged briefs back to 2026-04-09.
- The bitter-lesson reframe (`2026-04-25`) is load-bearing: collapsing the API to `scene()` + `diff()` is what makes the "calm" pitch defensible. Keep the 12 wrapper tools and the doc's first paragraph reads as marketing fiction.

## Existing players / prior art
- **Feldera** — owns the "calm tech for machines" coinage; cite, don't claim. (https://www.feldera.com/blog/...embed-them...)
- **Mark Weiser, "The Computer for the 21st Century" (1991)** — the original anchor citation. Quote it once; gives the doc gravitas. (https://www.lri.fr/~mbl/Stanford/CS477/papers/Weiser-SciAm.pdf)
- **MutationObserver / CDP `DOM.*` events / Playwright `page.on('domcontentloaded')`** — the technical baselines UIPE has to beat. The pitch has to clarify *why* fused visual+DOM+temporal beats raw mutation events for an LLM consumer.
- **Browser-Use harness** — competitor on the "right interface for agents" axis; differentiates on ergonomics (raw CDP), not on perception fusion.

## Concrete next steps for Dirk
1. **Write the doc as five blocks, in this order** (target: 1 page / ~400 words). (a) **Thesis** — quote Weiser, restate Feldera's "calm tech for machines," declare UIPE's mission as the *perception layer* of that thesis. (b) **Three patterns we already do** — CLI ✓, reconciliation (watch/diff) ✓, specs (future). (c) **One pattern we uniquely do** — CDC for UI: the DOM is a database, `watch` is its CDC stream. (d) **MCPAASTA implication** — meter per change event, not per snapshot poll. Calm pricing for a calm interface. (e) **What we are not** — not a chatbot, not a 12-verb API, not a polling SaaS.
2. **Land it at `~/uipe/docs/positioning.md`** as the single source of truth. Mirror as `~/uipe/blog/calm-perception-for-agents.md` *draft only* — do not publish until the kernel reframe ships, otherwise the API surface contradicts the message.
3. **Citations only — no new vocabulary claims.** Cite Weiser + Feldera by name. The novel piece you own is "DOM = CDC," not "calm." Trying to own "calm" gets you a low-effort fight you don't need.
4. **Cap at 30 minutes as planned.** If the doc isn't done in 30, the 12-tool API surface is fighting you — that's diagnostic, not a writing problem. Stop and revisit the kernel reframe instead of grinding the doc.

## Open questions
- Should the doc lead with "CDC for UI" (technical) or "calm interface for agents" (philosophical)? Technical reads sharper; philosophical distributes better. Two drafts, A/B on a couple of trusted readers.
- Does tagging Gerd Zellweger / Feldera on publication invite collaboration or look opportunistic? Probably fine if the post genuinely extends the framing rather than rebrands it.
- Is there a 200-word "CDC for UI" companion post that distributes better than the positioning doc itself? (Same content, technical-blog packaging, much higher hit rate on HN/X than internal positioning docs.)
