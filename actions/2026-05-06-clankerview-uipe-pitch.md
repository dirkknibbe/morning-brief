---
date: 2026-05-06
classification: human
action: Email or DM ClankerView's founder with a 3-line UIPE pitch — "your personas need scene/affordance perception across state changes; we ship the MCP for that."
source_brief: briefs/2026-05-06.md
---

## TL;DR
ClankerView is a one-person shop (Andri, HN: `hookey`) that launched a Show HN on 2026-05-05. He built it after "experimenting with giving Claude Code access to a browser" — i.e. screenshot-driven agents reacting to images. That's exactly the layer UIPE replaces with structured scene/affordance/state-diff output via MCP. He has no public email and no Twitter found in search, so the cleanest channel is a reply on his still-warm HN thread (21h old, only 6 comments — he's engaging in every reply). Send the pitch there; if no reply in 48h, fall back to a guessed `hello@clankerview.com`.

## Key findings
- Solo founder, name **Andri**, HN handle `hookey`. (source: https://news.ycombinator.com/item?id=48022228)
- Built the product in ~1 week after a Claude-Code+browser experiment a month ago — meaning the perception path is a *prototype*, not deeply invested infrastructure. Replacement cost is low. (source: same HN comment)
- Pricing is $1/1k credits, ~$3 max per agent run; agents currently rely on raw screenshots + LLM. No mention of structured DOM/affordance extraction in the FAQ. (source: https://clankerview.com)
- Auth handling is brittle (cookies pasted via Cookie-Editor, deleted post-run). UIPE's `act` + `get_affordances` would also help here. (source: clankerview.com FAQ)
- HN profile has no email; ClankerView site has no contact page (`/about` and `/contact` 404). HN reply is the only verified channel. (source: HN user profile, 404s on both endpoints)

## Existing players / prior art
- **Browserbase / Stagehand** — agentic browser infra, sells the runtime not the perception. Could be Andri's current substrate. — https://browserbase.com
- **Anthropic Computer Use / Claude Code browser** — Andri's stated starting point. Image-only perception. — https://docs.claude.com
- **SensorHub / world2agent.ai** — push-based agent senses (today's brief). Different axis (events, not visual). — referenced in brief
- **UIPE** (us) — scene parse, affordances, compare_states, watch, get_console_logs, get_network_errors. The thing he actually needs for "see UI states across changes." — local

## Concrete next steps for Dirk
1. **Reply on the HN thread** (https://news.ycombinator.com/item?id=48022228) with the 3-line pitch below. Public reply gets surfaced to other lurkers reading the launch — bonus distribution. Draft:

   > Nice launch, Andri. Quick note: your agents currently react to screenshots, which is why you'll see them miss state-diffs (modal opened? form invalidated? toast fired?). I ship UIPE — an MCP that gives any agent structured scene + affordance perception and a `compare_states` primitive. Drops in alongside your current browser layer; happy to wire a demo against one of your share links if useful. — Dirk, dirkdevelops.com

2. **If no HN reply within 48h**, send the same text to `hello@clankerview.com` (unverified — solo-SaaS default). Subject: "UIPE for ClankerView personas — 3 lines."

3. **Have one share-link demo ready before sending.** Pick one of Andri's public shares (e.g. https://clankerview.com/share/sv20WB2Ssd8h8Q9a — the HN review) and run UIPE against the same flow so you can paste the structured output as a follow-up if he bites. This is the closest demo lead this month — don't waste it on "let's hop on a call" without artifact.

## Open questions
- Is Andri using Browserbase/Stagehand, raw Playwright, or Anthropic Computer Use under the hood? Determines whether UIPE slots in as a drop-in or needs a small adapter.
- Does he have a partner/co-founder, or is "I" in the HN comment literal? Affects whether a partnership ask vs. a tools-vendor ask is the right framing.
- His karma is 20 with a 2014 account — low signal, but suggests he's not chasing HN clout. Keep the pitch technical, not promotional.
