---
date: 2026-09-19
classification: research
action: "Study Deiko's site + demo; write the UIPE positioning paragraph (temporal/web-UI vs static cursor+voice capture) for landing-page copy."
source_brief: briefs/2026-09-19.md
---

## TL;DR
Deiko is real, shipped, and solves the *same premise* as UIPE — "agents can't see what you see" — but with a fundamentally different, narrower capture model: a **native macOS app** where you double-tap Right Option, **narrate out loud while hovering** the thing you mean, and it crops labelled screenshots into a "coin" you drag into Claude Code/Cursor. It's a **human-driven, point-in-time snapshot** requiring you to *speak the context*. UIPE's wedge is exactly the two things Deiko can't do: it captures the **temporal sequence of UI state** (the app *observes* that "this dropdown closes when I scroll" — Deiko forces you to say it aloud), and it lives **in the web/browser** where agents already operate — no install, no self-signed-cert friction, works alongside browser-driving agents. Don't compete on capture UX; compete on "we record what happened, you don't narrate it."

## Key findings
- Deiko's whole loop is **human narration**: hover + talk + lasso → cropped screenshots + a text brief. It captures *what you point at and say*, not what the UI *did*. (source: https://deiko.app)
- The demo's flagship example — *"this dropdown closes when I scroll, keep it open"* — is a **temporal/behavioral fact the user has to verbalize** because Deiko's capture is static. That is precisely the gap UIPE's temporal recording fills. (source: https://deiko.app)
- Pricing in the brief was wrong: it's **free + $3.99/mo Pro** (cloud transcription + BYO Sarvam/Groq key), not "$40 lifetime." On-device transcription after 30 free cloud minutes. (source: HN Show HN 49731089)
- Distribution friction is real: **self-signed cert, `curl | sh` install, 110MB Node runtime, macOS 14+ only.** A browser/web-native tool sidesteps all of it. (source: HN 49731089)
- Deiko has a **"The coin" / token angle** in its nav — a consumer-crypto flavor UIPE doesn't need to match and probably shouldn't. (source: https://deiko.app)

## Existing players / prior art
- **Deiko** — macOS cursor+voice+screenshot capture → drag into any agent — https://deiko.app
- **browser-use (115k★)** — agents that drive the browser; UIPE's natural neighbor/complement, not competitor — the temporal web layer feeds tools like this.

## Landing-page paragraph (draft copy)
> Deiko makes you narrate your screen. You point, you talk, you hand over a screenshot. But the thing you're describing — *"this dropdown closes when I scroll"* — is behavior over time, and you're transcribing it by hand because a snapshot can't hold it. **UIPE records the behavior.** It watches your web UI across time, so the agent gets the actual sequence of states and interactions, not your paraphrase of them — right in the browser, no install, no cert warnings, no coin. Point-in-time capture tells an agent what you saw. UIPE tells it what happened.

## Concrete next steps for Dirk
1. Paste the draft paragraph above onto the UIPE landing page as the "vs. snapshot tools" section; A/B the closing line.
2. Record a 10s UIPE demo of the *exact* dropdown-on-scroll case Deiko's demo uses — same scenario, but UIPE captures it without you saying a word. Head-to-head is the whole pitch.
3. Lead all copy with **"no install, in the browser"** — Deiko's `curl | sh` + self-signed cert is a concrete friction wedge.

## Open questions
- Does UIPE's temporal capture actually surface state-transition events (scroll→close) cleanly today, or is that still aspirational? The copy only lands if the demo backs it.
- Is Deiko web-only in intent or will it stay macOS-native? If it ports to browser, the distribution wedge shrinks.
