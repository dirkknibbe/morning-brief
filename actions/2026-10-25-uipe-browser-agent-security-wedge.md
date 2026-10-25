---
date: 2026-10-25
classification: research
action: Read the ricuicui "browser = agent gateway" and Marsh content-negotiation pieces, then draft one UIPE landing-page line naming the browser-agent security fear.
source_brief: briefs/2026-10-25.md
---

## TL;DR
Both pieces point at the same gap from opposite ends: the browser is becoming the default agent gateway (ricuicui) *because* it has the access, context, and action no API offers — and the web is racing to serve agents clean, machine-readable surfaces (Marsh). Neither solves the catch ricuicui names out loud: a browser agent "sees everything you see." That unscoped visibility is UIPE's wedge. The landing line should sell *safe perception*, not features. Recommended headline below; ship it as the hero line and move on — this is a 10-minute copy decision, not a project.

## Key findings
- The browser wins as agent runtime because of three things an API can't give: you're already logged in (access), the open page states intent (context), and a button is identical for human and agent (action). (source: brief summary of ricuicui essay; ricuicui.com confirms "lit, clique et remplit les pages sous vos yeux… vos données restent chez vous" — read/click/fill under your eyes, data stays local)
- ricuicui's own security framing is "your data stays with you / local AI" — they sell *privacy* as the answer to the sees-everything problem. UIPE can sell *scoped perception + accountability*, a sharper and more defensible angle than "runs locally." (source: https://ricuicui.com)
- Marsh's pattern (Accept: text/markdown negotiation + Vary: Accept + llms.txt) is about making a site *legible* to agents — the supply side. It assumes the agent is trusted. Nobody in that post asks "should this agent see this page at all." That unasked question is the UIPE sale. (source: https://deallocatedobjects.com/posts/making-my-blog-readable-by-ai-agents)
- Irony worth noting: ricuicui.com/blog 404s and serves no markdown mirror — the "agent browser" company hasn't done the Marsh treatment on its own site. The agent-readable web is still early; the perception/safety layer is earlier still. (source: live fetch, 2026-10-25)

## Existing players / prior art
- ricuicui — local-AI pro browser (Rust/Servo), sells privacy-via-local as the safety story — https://ricuicui.com
- browser-use (~119k stars) + Browser Use Cloud — commercializing browser agents; no scoped-perception layer — category is heating up
- agent-browser-gateway / browsergateway.io — "per-tab explicit consent" and "scoped permissions, audit trails" — closest competitors to UIPE's framing; worth a 5-min look before finalizing positioning

## Draft landing-page lines
**Recommended hero:**
> **Your agent sees everything you see. UIPE makes it see only what it should.**
> Scoped perception and an audit trail for every browser agent — so "it clicked something" never means "it saw everything."

Alternates (pick by tone):
1. *Blunt:* "A browser agent has your whole screen. UIPE gives it a need-to-know one."
2. *Trust-forward:* "Perception you can prove. Every page your agent reads, scoped and logged."
3. *Fear-direct (brief's seed, tightened):* "Your agent sees everything you see — UIPE makes it see *safely*."

## Concrete next steps for Dirk
1. Paste the recommended hero into the UIPE landing draft; keep one alternate as the sub-line A/B.
2. Spend 5 min on browsergateway.io + agent-browser-gateway — if "scoped permissions + audit trails" is already their headline, differentiate on *perception* (what the agent interprets) vs their *permissions* (what it can touch).
3. Decide the noun: "scoped perception" vs "need-to-know vision." Lock one term and use it everywhere.

## Open questions
- Is UIPE's actual mechanism redaction-before-model, consent-per-element, or post-hoc audit? The line promises "sees only what it should" — the demo has to back that specific claim.
- Does the buyer fear *data leakage* (privacy, ricuicui's frame) or *wrong actions* (blast radius)? The hero leans perception/leakage; if the real pain is actions, swap to the blast-radius line from the brief's idea list.
